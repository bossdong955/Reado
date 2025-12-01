// Reado - Background Service Worker

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('🔔 Alarm triggered:', alarm.name, 'at', new Date(alarm.scheduledTime));

    if (alarm.name.startsWith('reminder-')) {
        const url = alarm.name.replace('reminder-', '');

        // Retrieve the item to get the title
        chrome.storage.sync.get([url], (result) => {
            const item = result[url];
            if (item) {
                console.log('📬 Showing notification for:', item.title);
                showNotification(url, item.title);
            } else {
                console.warn('⚠️ Item not found in storage for URL:', url);
            }
        });
    }
});

// Show notification
function showNotification(url, title) {
    chrome.notifications.create(url, {
        type: 'basic',
        iconUrl: 'assets/icon128.png',
        title: 'Reado: 该阅读了!',
        message: title || '你有一个保存的页面需要阅读。',
        buttons: [{ title: '打开页面' }, { title: '推迟 1小时' }],
        priority: 2
    }, (notificationId) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Notification creation failed:', chrome.runtime.lastError);
        } else {
            console.log('✅ Notification created successfully:', notificationId);
        }
    });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    // notificationId is the URL
    chrome.tabs.create({ url: notificationId });
    chrome.notifications.clear(notificationId);
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
        // Open Page
        chrome.tabs.create({ url: notificationId });
        chrome.notifications.clear(notificationId);
    } else if (buttonIndex === 1) {
        // Snooze 1h
        const snoozeTime = Date.now() + 60 * 60 * 1000;
        const alarmName = `reminder-${notificationId}`;

        console.log('😴 Snoozing notification for 1 hour');
        console.log('   New alarm time:', new Date(snoozeTime).toLocaleString('zh-CN'));

        // Create new alarm
        chrome.alarms.create(alarmName, { when: snoozeTime }, () => {
            if (chrome.runtime.lastError) {
                console.error('❌ Snooze alarm creation failed:', chrome.runtime.lastError);
            } else {
                console.log('✅ Snooze alarm created');

                // Update storage with new reminder time
                chrome.storage.sync.get([notificationId], (result) => {
                    const item = result[notificationId];
                    if (item) {
                        item.reminder = snoozeTime;
                        chrome.storage.sync.set({ [notificationId]: item }, () => {
                            console.log('💾 Storage updated with new reminder time');
                        });
                    }
                });
            }
        });

        chrome.notifications.clear(notificationId);
    }
});

// Context menu to save page (Optional but good for UX)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-page",
        title: "保存到 Reado",
        contexts: ["page"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "save-page") {
        const item = {
            url: tab.url,
            title: tab.title,
            savedAt: Date.now(),
            read: false,
            reminder: null,
            tags: []
        };
        chrome.storage.sync.set({ [tab.url]: item }, () => {
            console.log('Page saved via context menu');
        });
    }
});

// Auto-mark as read when visiting a saved URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        chrome.storage.sync.get([tab.url], (result) => {
            const item = result[tab.url];
            if (item && !item.read) {
                item.read = true;
                // Clear alarm if exists
                if (item.reminder) {
                    chrome.alarms.clear(`reminder-${tab.url}`);
                    item.reminder = null;
                }

                chrome.storage.sync.set({ [tab.url]: item }, () => {
                    console.log(`Auto-marked as read: ${tab.url}`);
                });
            }
        });
    }
});
