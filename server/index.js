const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/trades', require('./routes/trades'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/market',   require('./routes/market'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Trading Journal API running at http://localhost:${PORT}`);
});
