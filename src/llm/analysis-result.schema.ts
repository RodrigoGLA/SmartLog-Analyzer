import { z } from 'zod';

export const analysisResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  findings: z
    .array(
      z.object({
        serviceId: z.number().int().positive().nullable().optional(),
        category: z.string().min(1).max(100),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        description: z.string().min(1).max(1000),
      }),
    )
    .max(100),
  suggestions: z.array(z.string().min(1).max(500)).max(50),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
