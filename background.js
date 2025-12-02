// Reado - Background Service Worker

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('🔔 Alarm triggered:', alarm.name, 'at', new Date(alarm.scheduledTime));

    if (alarm.name.startsWith('reminder-')) {
        const url = alarm.name.replace('reminder-', '');

        // Retrieve item and settings to handle notification and scheduling
        chrome.storage.sync.get(['settings', url], (result) => {
            const item = result[url];
            if (item) {
                console.log('📬 Showing notification for:', item.title);
                showNotification(url, item.title);

                // --- Optimistic Scheduling ---
                // Immediately schedule the NEXT recurring reminder.
                // If the user clicks "Open" or "Snooze", we will overwrite/cancel this.

                const settings = result.settings || {};
                const repeatInterval = settings.repeatReminderInterval || settings.secondReminderInterval || 60; // Default 60 mins
                const reminderCount = item.reminderCount || 0;

                if (reminderCount < 10) {
                    const nextReminderTime = Date.now() + repeatInterval * 60 * 1000;

                    console.log(`🔄 Optimistically scheduling next reminder (${reminderCount + 1}/10) for:`, new Date(nextReminderTime).toLocaleString('zh-CN'));

                    chrome.alarms.create(alarm.name, { when: nextReminderTime });

                    // Update state
                    item.reminder = nextReminderTime;
                    item.reminderCount = reminderCount + 1;
                    item.lastNotificationTime = Date.now();

                    chrome.storage.sync.set({ [url]: item });
                } else {
                    console.log('🛑 Max reminder count reached (10), no further auto-reminders.');
                }

            } else {
                console.warn('⚠️ Item not found in storage for URL:', url);
            }
        });
    } else if (alarm.name.startsWith('dismiss-')) {
        // Handle auto-dismiss alarm
        const url = alarm.name.replace('dismiss-', '');
        console.log('⏰ Auto-dismissing notification for:', url);
        chrome.notifications.clear(url);
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

            // Create auto-dismiss alarm (30 seconds)
            const dismissTime = Date.now() + 30000; // 30 seconds
            chrome.alarms.create(`dismiss-${url}`, { when: dismissTime });
        }
    });
}

// Handle notification clicks (Open Page)
chrome.notifications.onClicked.addListener((notificationId) => {
    console.log('🖱️ Notification clicked (Open Page):', notificationId);

    // 1. Clear Dismiss Alarm
    chrome.alarms.clear(`dismiss-${notificationId}`);

    // 2. Clear the Optimistically Scheduled Recurring Reminder
    // (Since user handled it, we don't need to remind again)
    chrome.alarms.clear(`reminder-${notificationId}`);

    // 3. Open Page
    chrome.tabs.create({ url: notificationId });
    chrome.notifications.clear(notificationId);

    // 4. Reset Reminder Count in Storage (Optional, but good for future)
    chrome.storage.sync.get([notificationId], (result) => {
        const item = result[notificationId];
        if (item) {
            item.reminderCount = 0;
            item.read = true; // Mark as read since opened
            item.readAt = Date.now(); // Track when actually read
            item.reminder = null; // Clear reminder time
            chrome.storage.sync.set({ [notificationId]: item });
        }
    });
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    // Clear Dismiss Alarm
    chrome.alarms.clear(`dismiss-${notificationId}`);

    if (buttonIndex === 0) {
        // --- Open Page ---
        console.log('🖱️ "Open Page" button clicked:', notificationId);

        // Clear Recurring Reminder
        chrome.alarms.clear(`reminder-${notificationId}`);

        chrome.tabs.create({ url: notificationId });
        chrome.notifications.clear(notificationId);

        // Update Storage
        chrome.storage.sync.get([notificationId], (result) => {
            const item = result[notificationId];
            if (item) {
                item.reminderCount = 0;
                item.read = true;
                item.readAt = Date.now();
                item.reminder = null;
                chrome.storage.sync.set({ [notificationId]: item });
            }
        });

    } else if (buttonIndex === 1) {
        // --- Snooze 1h ---
        const snoozeTime = Date.now() + 60 * 60 * 1000;
        const alarmName = `reminder-${notificationId}`;

        console.log('😴 Snoozing notification for 1 hour');

        // Overwrite the Optimistically Scheduled alarm with the Snooze alarm
        chrome.alarms.create(alarmName, { when: snoozeTime });

        chrome.notifications.clear(notificationId);

        // Update Storage
        chrome.storage.sync.get([notificationId], (result) => {
            const item = result[notificationId];
            if (item) {
                item.reminder = snoozeTime;
                item.reminderCount = 0; // Reset count
                chrome.storage.sync.set({ [notificationId]: item });
            }
        });
    }
});

// Context menu to save page
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
            tags: [],
            reminderCount: 0,
            lastNotificationTime: null,
            originalReminder: null
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
                item.readAt = Date.now();
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
