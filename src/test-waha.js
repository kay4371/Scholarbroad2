const axios = require('axios');

axios.get('https://waha-production-c39f.up.railway.app/api/messages', {
  headers: { 'X-Api-Key': 'waha123' },
  params: { session: 'default', chatId: '120363402569445171@g.us', limit: 5 }
})
.then(r => console.log(JSON.stringify(r.data, null, 2)))
.catch(e => console.log('ERROR:', e.response?.status, JSON.stringify(e.response?.data)));
