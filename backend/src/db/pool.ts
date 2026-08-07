import { Pool } from 'pg';
import { dbConfig } from './config';

export const pool = new Pool(dbConfig);