import https from 'https';

https.get('https://api.sofascore.app/api/v1/sport/football/events/live', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Data:', data.substring(0, 100));
  });
}).on('error', (e) => {
  console.error(e);
});
