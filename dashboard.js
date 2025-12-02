document.addEventListener('DOMContentLoaded', () => {
    const itemListEl = document.getElementById('item-list');
    const tabs = document.querySelectorAll('.tab');
    const tagSearchInput = document.getElementById('tag-search');
    const clearSearchBtn = document.getElementById('clear-search');

    // Restore last active tab from localStorage
    let currentTab = localStorage.getItem('reado_active_tab') || 'unread';
    let searchTags = [];

    // Set initial active tab
    tabs.forEach(tab => {
        if (tab.dataset.tab === currentTab) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;

            // Save to localStorage
            localStorage.setItem('reado_active_tab', currentTab);

            loadItems();
        });
    });

    // Tag search
    tagSearchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.trim();
        if (searchText) {
            searchTags = searchText.split(/[,，]\s*/).filter(t => t.length > 0);
        } else {
            searchTags = [];
        }
        loadItems();
    });

    // Clear search
    clearSearchBtn.addEventListener('click', () => {
        tagSearchInput.value = '';
        searchTags = [];
        loadItems();
    });

    // Load items
    function loadItems() {
        chrome.storage.sync.get(null, (items) => {
            const allItems = Object.values(items).filter(item => item.url && item.title);
            let filteredItems = allItems.filter(item => {
                if (currentTab === 'unread') return !item.read;
                return item.read;
            });

            // Filter by tags if search is active
            if (searchTags.length > 0) {
                filteredItems = filteredItems.filter(item => {
                    if (!item.tags || item.tags.length === 0) return false;
                    // Check if any search tag matches any item tag (case-insensitive)
                    return searchTags.some(searchTag =>
                        item.tags.some(itemTag =>
                            itemTag.toLowerCase().includes(searchTag.toLowerCase())
                        )
                    );
                });
            }

            // Sort by savedAt descending
            filteredItems.sort((a, b) => b.savedAt - a.savedAt);

            renderItems(filteredItems);
        });
    }

    // Check if item is overdue
    function isOverdue(item) {
        return item.reminder && item.reminder < Date.now() && !item.read;
    }

    // Render items
    function renderItems(items) {
        itemListEl.innerHTML = '';

        if (items.length === 0) {
            const emptyMessage = searchTags.length > 0
                ? `未找到包含标签 "${searchTags.join(', ')}" 的内容。`
                : '暂无内容。';
            itemListEl.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';

            // Add overdue class if applicable
            if (isOverdue(item)) {
                card.classList.add('overdue');
            }

            // Store URL for context menu
            card.dataset.url = item.url;

            const dateStr = new Date(item.savedAt).toLocaleDateString('zh-CN');

            // Build reminder display
            let reminderStr = '';
            if (item.reminder || item.originalReminder) {
                let parts = [];

                // Show current reminder time if exists
                if (item.reminder) {
                    const reminderTime = new Date(item.reminder).toLocaleString('zh-CN', { hour12: false });
                    parts.push(`⏰ 提醒: ${reminderTime}`);
                }

                // Show original reminder if different from current
                if (item.originalReminder && (!item.reminder || item.originalReminder !== item.reminder)) {
                    const originalTime = new Date(item.originalReminder).toLocaleString('zh-CN', { hour12: false });

                    // For read items without current reminder, show as main time
                    if (!item.reminder && item.read) {
                        parts.push(`⏰ 原定: ${originalTime}`);
                    } else {
                        // Otherwise show as supplementary info
                        parts.push(`📅 原始: ${originalTime}`);
                    }

                    // Calculate and display delay for read items
                    if (item.read) {
                        // Show when it was actually read
                        if (item.readAt) {
                            const readTime = new Date(item.readAt).toLocaleString('zh-CN', { hour12: false });
                            parts.push(`📖 已读: ${readTime}`);

                            // Calculate delay
                            const delayMs = item.readAt - item.originalReminder;
                            if (delayMs > 0) {
                                const hours = Math.floor(delayMs / (1000 * 60 * 60));
                                const mins = Math.floor((delayMs % (1000 * 60 * 60)) / (1000 * 60));
                                let delayText = '';
                                if (hours > 0) delayText += `${hours}小时`;
                                if (mins > 0) delayText += `${mins}分`;
                                if (!delayText) delayText = '少许';

                                parts.push(`⏱️ 延迟${delayText}`);
                            } else if (delayMs < 0) {
                                // Read before reminder time
                                const earlyMs = Math.abs(delayMs);
                                const hours = Math.floor(earlyMs / (1000 * 60 * 60));
                                const mins = Math.floor((earlyMs % (1000 * 60 * 60)) / (1000 * 60));
                                let earlyText = '';
                                if (hours > 0) earlyText += `${hours}小时`;
                                if (mins > 0) earlyText += `${mins}分`;
                                if (!earlyText) earlyText = '少许';

                                parts.push(`✅ 提前${earlyText}`);
                            }
                        }
                    }
                    // Calculate postponement for unread items
                    else if (!item.read && item.reminder && item.originalReminder < item.reminder) {
                        const delayMs = item.reminder - item.originalReminder;
                        const hours = Math.floor(delayMs / (1000 * 60 * 60));
                        const mins = Math.floor((delayMs % (1000 * 60 * 60)) / (1000 * 60));
                        let delayText = '';
                        if (hours > 0) delayText += `${hours}小时`;
                        if (mins > 0) delayText += `${mins}分`;
                        if (!delayText) delayText = '少许';

                        parts.push(`⏳ 延期${delayText}`);
                    }
                }

                reminderStr = parts.length > 0 ? ' • ' + parts.join(' • ') : '';
            }

            let tagsHtml = '';
            if (item.tags && item.tags.length > 0) {
                tagsHtml = item.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('');
            }

            // Favicon URL using the MV3 _favicon helper
            const faviconUrl = chrome.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32`);

            card.innerHTML = `
        <div class="card-icon">
            <img src="${faviconUrl}" alt="Icon" onerror="this.src='assets/icon_jobs.svg'">
        </div>
        <div class="item-info">
          <a href="${item.url}" target="_blank" class="item-title">${item.title}</a>
          <div class="item-meta">
            ${dateStr}${reminderStr}
          </div>
          <div class="item-tags">
            ${tagsHtml}
          </div>
        </div>
        <div class="item-actions">
          ${!item.read ? `<button class="btn-icon mark-read-btn" data-url="${item.url}" title="标记已读">✓</button>` : ''}
          <button class="btn-icon delete-btn" data-url="${item.url}" title="删除">✕</button>
        </div>
      `;

            itemListEl.appendChild(card);
        });

        // Add event listeners
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                markAsRead(url);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                deleteItem(url);
            });
        });
    }

    function markAsRead(url) {
        chrome.storage.sync.get([url], (result) => {
            if (result[url]) {
                const item = result[url];
                item.read = true;
                item.readAt = Date.now(); // Track when marked as read
                // Clear alarm if exists
                chrome.alarms.clear(`reminder-${url}`);
                item.reminder = null;

                chrome.storage.sync.set({ [url]: item }, () => {
                    loadItems();
                });
            }
        });
    }

    function deleteItem(url) {
        if (confirm('确定要删除这条记录吗？')) {
            chrome.storage.sync.remove(url, () => {
                chrome.alarms.clear(`reminder-${url}`);
                loadItems();
            });
        }
    }

    // Initial load
    loadItems();
});
