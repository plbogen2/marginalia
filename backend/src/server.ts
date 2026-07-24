import { app } from './app.js';

const port = process.env.PORT || 3000;

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
