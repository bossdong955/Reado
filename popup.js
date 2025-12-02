document.addEventListener('DOMContentLoaded', () => {
    const pageTitleEl = document.getElementById('page-title');
    const pageUrlEl = document.getElementById('page-url');
    const saveBtn = document.getElementById('save-btn');
    const openDashboardLink = document.getElementById('open-dashboard');
    const reminderBtns = document.querySelectorAll('.reminder-btn');
    const customTimeContainer = document.getElementById('custom-time-container');
    const customTimeInput = document.getElementById('custom-time');
    const tagsInput = document.getElementById('tags-input');
    const secondReminderIntervalSelect = document.getElementById('second-reminder-interval');

    let currentTab = null;
    let selectedReminder = null;

    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        currentTab = tabs[0];
        if (currentTab) {
            pageTitleEl.textContent = currentTab.title;
            pageUrlEl.textContent = currentTab.url;

            // Check if already saved
            chrome.storage.sync.get([currentTab.url], (result) => {
                if (result[currentTab.url]) {
                    const item = result[currentTab.url];
                    saveBtn.textContent = '更新提醒';
                    if (item.tags) {
                        tagsInput.value = item.tags.join(', ');
                    }
                }
            });
        }
    });

    // Load settings
    chrome.storage.sync.get(['settings'], (result) => {
        if (result.settings) {
            // Support both new and old keys for backward compatibility
            secondReminderIntervalSelect.value = result.settings.repeatReminderInterval || result.settings.secondReminderInterval || 60;
        }
    });

    // Handle reminder selection
    reminderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            reminderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedReminder = btn.dataset.time;

            if (selectedReminder === 'custom') {
                customTimeContainer.classList.remove('hidden');
            } else {
                customTimeContainer.classList.add('hidden');
            }
        });
    });

    // Handle settings change
    secondReminderIntervalSelect.addEventListener('change', () => {
        const settings = {
            repeatReminderInterval: parseInt(secondReminderIntervalSelect.value)
        };
        chrome.storage.sync.set({ settings }, () => {
            console.log('⚙️ Settings saved:', settings);
        });
    });

    // Handle Save
    saveBtn.addEventListener('click', () => {
        if (!currentTab) return;

        // Parse tags
        const tagsStr = tagsInput.value.trim();
        const tags = tagsStr ? tagsStr.split(/[,，]\s*/).filter(t => t.length > 0) : [];

        const item = {
            url: currentTab.url,
            title: currentTab.title,
            savedAt: Date.now(),
            read: false,
            reminder: null,
            tags: tags,
            secondReminder: false,
            lastNotificationTime: null,
            originalReminder: null
        };

        let reminderTime = null;

        if (selectedReminder) {
            const now = new Date();
            if (selectedReminder === 'later') {
                reminderTime = now.getTime() + 60 * 60 * 1000;
            } else if (selectedReminder === 'tonight') {
                now.setHours(20, 0, 0, 0);
                if (now.getTime() <= Date.now()) {
                    now.setDate(now.getDate() + 1); // If past 8pm, set for tomorrow 8pm
                }
                reminderTime = now.getTime();
            } else if (selectedReminder === 'tomorrow') {
                now.setDate(now.getDate() + 1);
                now.setHours(9, 0, 0, 0);
                reminderTime = now.getTime();
            } else if (selectedReminder === 'custom') {
                const customVal = customTimeInput.value;
                if (customVal) {
                    reminderTime = new Date(customVal).getTime();
                }
            }
        }

        if (reminderTime) {
            item.reminder = reminderTime;
            item.originalReminder = reminderTime;
            const alarmName = `reminder-${item.url}`;
            chrome.alarms.create(alarmName, { when: reminderTime }, () => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Alarm creation failed:', chrome.runtime.lastError);
                } else {
                    console.log('⏰ Alarm created:', alarmName);
                    console.log('   Scheduled for:', new Date(reminderTime).toLocaleString('zh-CN'));
                    console.log('   Time until alarm:', Math.round((reminderTime - Date.now()) / 1000 / 60), 'minutes');

                    // Verify alarm was created
                    chrome.alarms.get(alarmName, (alarm) => {
                        if (alarm) {
                            console.log('✅ Alarm verified in system:', alarm);
                        } else {
                            console.error('⚠️ Alarm not found after creation!');
                        }
                    });
                }
            });
        }

        chrome.storage.sync.set({ [item.url]: item }, () => {
            saveBtn.textContent = '已保存!';
            saveBtn.style.backgroundColor = '#34C759'; // Apple Green
            setTimeout(() => {
                window.close();
            }, 2000); // 延长到 2 秒，让用户有更多时间看到反馈
        });
    });

    // Open Dashboard
    openDashboardLink.addEventListener('click', (e) => {
        e.preventDefault();
        const dashboardUrl = chrome.runtime.getURL('dashboard.html');
        console.log('Opening dashboard:', dashboardUrl);
        chrome.tabs.create({ url: dashboardUrl });
    });
});
