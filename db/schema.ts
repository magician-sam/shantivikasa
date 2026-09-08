import {sqliteTable,text,integer,blob} from 'drizzle-orm/sqlite-core';
export const products=sqliteTable('cloud_products',{id:text('id').primaryKey(),payload:text('payload').notNull()});
export const sales=sqliteTable('cloud_sales',{id:text('id').primaryKey(),payload:text('payload').notNull()});
export const commits=sqliteTable('cloud_commits',{revision:integer('revision').primaryKey(),id:text('id').notNull().unique(),createdAt:text('created_at').notNull()});

export const photos=sqliteTable('cloud_photos',{hash:text('hash').primaryKey(),mime:text('mime').notNull(),bytes:blob('bytes',{mode:'buffer'}).notNull()});
export const attempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),window:integer('window').notNull(),count:integer('count').notNull()});

export const categories=sqliteTable('cloud_categories',{key:text('key').primaryKey(),name:text('name').notNull(),removed:integer('removed').notNull().default(0)});
