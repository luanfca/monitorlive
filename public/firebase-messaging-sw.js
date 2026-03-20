importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB5bZVcvu4raoC_1h1NdqXU1ZSa_6S9xHg",
  authDomain: "livematch-290b9.firebaseapp.com",
  projectId: "livematch-290b9",
  storageBucket: "livematch-290b9.firebasestorage.app",
  messagingSenderId: "591993571890",
  appId: "1:591993571890:web:79f304bf75ef45330e0a2b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
