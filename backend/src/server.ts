import { app } from './app.js';

const port = process.env.PORT || 3000;

app.listen(Number(port), '127.0.0.1', () => {
  console.log(`Server is running on http://127.0.0.1:${port}`);
});
