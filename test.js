const https = require('https');

https.get('https://www.sofascore.com/api/v1/sport/football/events/live', (res) => {
  console.log('Status Code:', res.statusCode);
}).on('error', (e) => {
  console.error(e);
});
