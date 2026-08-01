import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env with an explicit path so this works regardless of CWD.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
