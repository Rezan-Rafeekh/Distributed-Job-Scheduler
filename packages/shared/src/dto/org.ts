import { z } from "zod";
import { OrgRole } from "../enums.js";

export const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(OrgRole),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(OrgRole),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
