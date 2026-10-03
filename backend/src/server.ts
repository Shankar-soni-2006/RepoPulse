import { env } from './config/env';
import app from './app';

const port = parseInt(env.PORT, 10);

app.listen(port, () => {
  console.log(`✅ RepoPulse backend running on port ${port} [${env.NODE_ENV}]`);
});
