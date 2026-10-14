import express from 'express';
import { app, connect } from './app.js';

let uri = process.env.MONGODB_URI;
if (!uri) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  uri = (await MongoMemoryServer.create()).getUri();
  console.log('MONGODB_URI not set: using an in-memory MongoDB (data is lost on exit)');
}
await connect(uri);

app.use(express.static('dist')); // built dashboard + tracker + demo pages

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}`));
