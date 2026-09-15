import type { IChatProject, IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

export type ProjectUploadAuthResult =
  | { allowed: true }
  | { allowed: false; status: number; error: string; message: string };

export interface ProjectUploadAuthParams {
  userId: string;
  chatProjectId?: string;
}

export interface ProjectUploadAuthDeps {
  getChatProject: (userId: string, projectId: string) => Promise<IChatProject | null>;
}

/**
 * Projects have no sharing/ACL system — every method that reads a project
 * already scopes by `{ _id, user }`, so a non-owner's lookup naturally
 * returns `null`. That lookup *is* the authorization check.
 */
export async function checkProjectUploadAuth(
  params: ProjectUploadAuthParams,
  deps: ProjectUploadAuthDeps,
): Promise<ProjectUploadAuthResult> {
  const { userId, chatProjectId } = params;
  if (!chatProjectId) {
    return { allowed: true };
  }

  const project = await deps.getChatProject(userId, chatProjectId);
  if (!project) {
    return { allowed: false, status: 404, error: 'Not Found', message: 'Project not found' };
  }

  return { allowed: true };
}

/** @returns true if denied (response already sent), false if allowed */
export async function verifyProjectUploadPermission({
  req,
  res,
  metadata,
  getChatProject,
}: {
  req: ServerRequest;
  res: Response;
  metadata: { chatProjectId?: string };
  getChatProject: ProjectUploadAuthDeps['getChatProject'];
}): Promise<boolean> {
  const user = req.user as IUser;
  const result = await checkProjectUploadAuth(
    { userId: user.id, chatProjectId: metadata.chatProjectId },
    { getChatProject },
  );

  if (!result.allowed) {
    res.status(result.status).json({ error: result.error, message: result.message });
    return true;
  }
  return false;
}
