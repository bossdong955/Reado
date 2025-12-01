document.addEventListener('DOMContentLoaded', () => {
    const itemListEl = document.getElementById('item-list');
    const tabs = document.querySelectorAll('.tab');
    const tagSearchInput = document.getElementById('tag-search');
    const clearSearchBtn = document.getElementById('clear-search');
    let currentTab = 'unread';
    let searchTags = [];

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
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
            const allItems = Object.values(items);
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

            const dateStr = new Date(item.savedAt).toLocaleDateString('zh-CN');
            const reminderStr = item.reminder ? ` • 提醒: ${new Date(item.reminder).toLocaleString('zh-CN')}` : '';

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
