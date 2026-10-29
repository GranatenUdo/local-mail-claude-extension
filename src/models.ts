import { z } from 'zod';
export const accountSchema = z.enum(['gmx', 'proton']);
const folder = z.string().min(1).max(512).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const refSchema = z.object({ account: accountSchema, folder, uidValidity: z.string().regex(/^\d{1,20}$/), uid: z.number().int().min(1).max(4294967295) }).strict();
export const searchSchema = z.object({ account: accountSchema, folder: folder.default('INBOX'),
  from: z.string().max(512).optional(), subject: z.string().max(512).optional(), text: z.string().max(512).optional(),
  since: z.iso.date().optional(), before: z.iso.date().optional(), unread: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25), cursor: z.string().max(4096).optional(),
}).strict();
export const attachmentSchema = z.object({ ref: refSchema, part: z.string().regex(/^\d+(\.\d+)*$/).max(128) }).strict();
export type MessageRef = z.infer<typeof refSchema>;
export type SearchInput = z.input<typeof searchSchema>;
