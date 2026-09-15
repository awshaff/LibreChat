import { mergeFileConfig } from 'librechat-data-provider';
import type { IChatProject, IMongoFile } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { TokenCountFn } from '~/utils/text';
import type { ServerRequest } from '~/types';
import { extractFileContext } from '~/files/context';
import { countTokens } from '~/utils/tokenizer';

/**
 * Share of a conversation's resolved context window that project knowledge
 * may occupy, before the global `fileTokenLimit` ceiling is applied. Keeps
 * a large-context model from having its whole window consumed by knowledge
 * files, while still scaling up from the (comparatively small) default
 * per-file limit designed for one-off chat attachments.
 */
const PROJECT_KNOWLEDGE_CONTEXT_SHARE = 0.25;

export type ProjectKnowledgeContextResult = {
  text: string | undefined;
  wasTruncated: boolean;
};

export interface BuildProjectKnowledgeContextParams {
  chatProjectId?: string | null;
  userId: string;
  req?: ServerRequest;
  /** The specific conversation's resolved max context tokens, if known. */
  maxContextTokens?: number;
  tokenCountFn?: TokenCountFn;
  getChatProject: (userId: string, projectId: string) => Promise<IChatProject | null>;
  getFiles: (
    filter: FilterQuery<IMongoFile>,
    sortOptions: Record<string, 1 | -1> | null | undefined,
    selectFields: Record<string, 0 | 1>,
  ) => Promise<IMongoFile[] | null>;
}

/**
 * Fetches a project's instructions + knowledge files and formats them into a
 * single context string for injection into every conversation in that
 * project — the project-scoped counterpart to `buildAgentScopedContext`.
 *
 * Instructions are never truncated (short, deliberately authored); only
 * knowledge files absorb truncation, split evenly across the remaining
 * budget once instructions are accounted for.
 */
export async function buildProjectKnowledgeContext({
  chatProjectId,
  userId,
  req,
  maxContextTokens,
  tokenCountFn = countTokens,
  getChatProject,
  getFiles,
}: BuildProjectKnowledgeContextParams): Promise<ProjectKnowledgeContextResult> {
  if (!chatProjectId) {
    return { text: undefined, wasTruncated: false };
  }

  const project = await getChatProject(userId, chatProjectId);
  if (!project) {
    return { text: undefined, wasTruncated: false };
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const globalFileTokenLimit = fileConfig.fileTokenLimit ?? 0;
  const budget = maxContextTokens
    ? Math.min(Math.floor(maxContextTokens * PROJECT_KNOWLEDGE_CONTEXT_SHARE), globalFileTokenLimit)
    : globalFileTokenLimit;

  const instructionsText = project.instructions?.trim();
  const instructionsTokens = instructionsText ? await tokenCountFn(instructionsText) : 0;
  const remaining = Math.max(0, budget - instructionsTokens);
  const instructionsBlock = instructionsText
    ? `# Project Instructions\n${instructionsText}`
    : undefined;

  let fileContextResult: ProjectKnowledgeContextResult = { text: undefined, wasTruncated: false };
  const knowledgeFileIds = project.knowledgeFileIds ?? [];

  if (knowledgeFileIds.length > 0) {
    const files =
      (await getFiles(
        { file_id: { $in: knowledgeFileIds }, user: userId } as FilterQuery<IMongoFile>,
        null,
        {
          file_id: 1,
          filename: 1,
          source: 1,
          text: 1,
        },
      )) ?? [];

    if (files.length > 0 && remaining <= 0) {
      fileContextResult = { text: undefined, wasTruncated: true };
    } else if (files.length > 0) {
      const perFileLimit = Math.max(1, Math.floor(remaining / files.length));
      fileContextResult = await extractFileContext({
        attachments: files,
        req,
        tokenCountFn,
        fileTokenLimit: perFileLimit,
      });
    }
  }

  const parts = [instructionsBlock, fileContextResult.text].filter((part): part is string =>
    Boolean(part),
  );

  return {
    text: parts.length > 0 ? parts.join('\n\n') : undefined,
    wasTruncated: fileContextResult.wasTruncated,
  };
}
