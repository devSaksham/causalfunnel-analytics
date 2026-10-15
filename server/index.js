import express from 'express';
import { app, connect } from './app.js';

await connect(); // MongoDB Atlas via MONGODB_URI (set it in .env, see .env.example)

app.use(express.static('dist', { extensions: ['html'] })); // built dashboard + tracker + demo pages; /demo/product works like on Netlify

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}`));
