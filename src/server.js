const app = require('./app');
require('dotenv').config();

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
