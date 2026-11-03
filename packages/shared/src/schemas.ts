import { z } from 'zod';
export const nativeRequestSchema = z
  .object({
    kind: z.enum(['question', 'permission', 'command', 'file', 'tool']),
    title: z.string().min(1).max(200),
    reason: z.string().max(4000).optional(),
    command: z.string().max(16000).optional(),
    cwd: z.string().max(4096).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    allowSession: z.boolean().optional(),
    questions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            header: z.string().max(200),
            question: z.string().min(1).max(6000),
            options: z
              .array(
                z
                  .object({ label: z.string().min(1).max(1000), description: z.string().max(4000) })
                  .strict(),
              )
              .max(20)
              .optional(),
            multiSelect: z.boolean().optional(),
            allowOther: z.boolean().optional(),
            isSecret: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.kind === 'question' &&
      (!value.questions?.length ||
        new Set(value.questions.map((q) => q.id)).size !== value.questions.length)
    )
      ctx.addIssue({ code: 'custom', message: '原生问题格式不正确' });
    if (JSON.stringify(value).length > 60000)
      ctx.addIssue({ code: 'custom', message: '原生请求内容过长' });
  });
export const nativeReplySchema = z
  .object({
    decision: z.enum(['accept', 'decline']),
    scope: z.enum(['once', 'session']).optional(),
    answers: z
      .record(
        z.string().min(1).max(200),
        z.array(z.string().trim().min(1).max(12000)).min(1).max(20),
      )
      .optional(),
  })
  .strict();
export const groupSchema = z.object({
  name: z.string().trim().min(1).max(48),
  description: z.string().trim().max(240).default(''),
  botIds: z.array(z.string()).max(32).default([]),
});
export const botSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_-]{1,32}$/u, '名称仅支持文字、数字、下划线和连字符'),
  description: z.string().trim().max(240).default(''),
  provider: z.enum(['claude-code', 'codex']),
});
export const messageSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string(),
  content: z.string().trim().min(1).max(16000),
  mentions: z.array(z.string()).max(32).default([]),
  replyTo: z.string().nullable().default(null),
});
