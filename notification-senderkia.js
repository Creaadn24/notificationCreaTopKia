// notification-sender-retry.js

const admin = require('firebase-admin');
const serviceAccount = require('./creatopkia-firebase-adminsdk-tpom8-b3ecfb8a4e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function sendNotificationWithRetry(title, body, maxRetries = 3) {
  let allTokens = [];
  let successCount = 0;
  let failureCount = 0;

  try {
    const usersSnapshot = await db.collection('usuario').get();
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.token) {
        allTokens.push(userData.token);
      }
    });

    console.log(`Total de tokens encontrados: ${allTokens.length}`);

    // Función para enviar notificaciones en lotes
    async function sendBatch(tokens) {
      const message = {
        notification: { title, body },
        tokens: tokens
      };

      const response = await messaging.sendMulticast(message);
      successCount += response.successCount;
      failureCount += response.failureCount;

      return response.responses.map((resp, idx) => ({
        token: tokens[idx],
        success: resp.success,
        error: resp.error ? resp.error.message : null
      }));
    }

    // Enviar notificaciones en lotes de 500 (límite de FCM)
    for (let i = 0; i < allTokens.length; i += 500) {
      const batch = allTokens.slice(i, i + 500);
      let retries = 0;
      let results = await sendBatch(batch);

      // Reintentar envíos fallidos
      while (retries < maxRetries) {
        const failedTokens = results.filter(r => !r.success).map(r => r.token);
        if (failedTokens.length === 0) break;

        console.log(`Reintentando ${failedTokens.length} tokens fallidos. Intento ${retries + 1}`);
        results = await sendBatch(failedTokens);
        retries++;
      }
    }

    console.log(`Notificaciones enviadas con éxito: ${successCount}`);
    console.log(`Notificaciones fallidas después de ${maxRetries} intentos: ${failureCount}`);

  } catch (error) {
    console.error('Error al enviar notificaciones:', error);
  }
}

// Uso del script
const title = " 🎭 Clasificación de las Emociones 🎭";
const body = "💭 Foco, fisiología y lingüística✨";
sendNotificationWithRetry(title, body)
  .then(() => console.log('Proceso de envío completado'))
  .catch(error => console.error('Error en el proceso de envío:', error));