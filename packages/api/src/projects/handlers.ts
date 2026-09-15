import { EModelEndpoint } from 'librechat-data-provider';
import { isValidObjectIdString, logger } from '@librechat/data-schemas';
import type {
  ChatProjectMethods,
  ChatProjectSortBy,
  ChatProjectSortDirection,
  CreateChatProjectInput,
  IMongoFile,
  UpdateChatProjectInput,
} from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { FilterQuery } from 'mongoose';
import { normalizeLimit, queryString } from '~/utils';
import { getModelMaxTokens } from '~/utils/tokens';
import { countTokens } from '~/utils/tokenizer';

const PROJECT_NOT_FOUND = 'Project not found';
const CONVERSATION_NOT_FOUND = 'Conversation not found';

const PROJECT_SORT_FIELDS = new Set<ChatProjectSortBy>(['name', 'createdAt', 'lastConversationAt']);

interface ProjectUser {
  id: string;
  _id?: {
    toString(): string;
  };
}

interface ProjectRequest extends Request {
  user?: ProjectUser;
}

type ProjectHandlerDependencies = Pick<
  ChatProjectMethods,
  | 'listChatProjects'
  | 'createChatProject'
  | 'getChatProject'
  | 'updateChatProject'
  | 'deleteChatProject'
  | 'assignConversationToProject'
> & {
  getFiles: (
    filter: FilterQuery<IMongoFile>,
    sortOptions?: Record<string, 1 | -1> | null,
    selectFields?: Record<string, 0 | 1> | null,
  ) => Promise<IMongoFile[] | null>;
};

const getUserId = (req: ProjectRequest): string => req.user?.id ?? req.user?._id?.toString() ?? '';

const normalizeString = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeSortBy = (value: Request['query'][string]): ChatProjectSortBy | undefined => {
  const sortBy = queryString(value);
  return PROJECT_SORT_FIELDS.has(sortBy as ChatProjectSortBy)
    ? (sortBy as ChatProjectSortBy)
    : undefined;
};

const normalizeSortDirection = (
  value: Request['query'][string],
): ChatProjectSortDirection | undefined => {
  const sortDirection = queryString(value);
  return sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : undefined;
};

const createProjectInput = (req: ProjectRequest): CreateChatProjectInput | null => {
  const name = normalizeString(req.body?.name);
  if (!name) {
    return null;
  }

  return {
    name,
    description: typeof req.body?.description === 'string' ? req.body.description : '',
    instructions: typeof req.body?.instructions === 'string' ? req.body.instructions : '',
  };
};

export function createProjectHandlers(deps: ProjectHandlerDependencies): {
  listProjects: (req: ProjectRequest, res: Response) => Promise<Response>;
  createProject: (req: ProjectRequest, res: Response) => Promise<Response>;
  assignConversationToProject: (req: ProjectRequest, res: Response) => Promise<Response>;
  getProject: (req: ProjectRequest, res: Response) => Promise<Response>;
  updateProject: (req: ProjectRequest, res: Response) => Promise<Response>;
  deleteProject: (req: ProjectRequest, res: Response) => Promise<Response>;
  listProjectFiles: (req: ProjectRequest, res: Response) => Promise<Response>;
  getProjectKnowledgeBudget: (req: ProjectRequest, res: Response) => Promise<Response>;
} {
  async function listProjects(req: ProjectRequest, res: Response): Promise<Response> {
    try {
      const result = await deps.listChatProjects(getUserId(req), {
        cursor: queryString(req.query.cursor),
        limit: normalizeLimit(req.query.limit),
        sortBy: normalizeSortBy(req.query.sortBy),
        sortDirection: normalizeSortDirection(req.query.sortDirection),
        search: queryString(req.query.search),
      });
      return res.status(200).json(result);
    } catch (error) {
      logger.error('[projects] Error listing projects', error);
      return res.status(500).json({ error: 'Error listing projects' });
    }
  }

  async function createProject(req: ProjectRequest, res: Response): Promise<Response> {
    const input = createProjectInput(req);
    if (!input) {
      return res.status(400).json({ error: 'name is required' });
    }

    try {
      const project = await deps.createChatProject(getUserId(req), input);
      return res.status(201).json(project);
    } catch (error) {
      logger.error('[projects] Error creating project', error);
      return res.status(500).json({ error: 'Error creating project' });
    }
  }

  async function assignConversationToProject(
    req: ProjectRequest,
    res: Response,
  ): Promise<Response> {
    const { conversationId } = req.params;
    const projectId = req.body?.projectId ?? null;

    if (projectId !== null && typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId must be a string or null' });
    }

    try {
      const result = await deps.assignConversationToProject(
        getUserId(req),
        conversationId,
        projectId,
      );
      if (!result) {
        return res.status(404).json({ error: CONVERSATION_NOT_FOUND });
      }
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === PROJECT_NOT_FOUND) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }
      logger.error('[projects] Error assigning conversation to project', error);
      return res.status(500).json({ error: 'Error assigning conversation to project' });
    }
  }

  async function getProject(req: ProjectRequest, res: Response): Promise<Response> {
    const { projectId } = req.params;
    if (!isValidObjectIdString(projectId)) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }

    try {
      const project = await deps.getChatProject(getUserId(req), projectId);
      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }
      return res.status(200).json(project);
    } catch (error) {
      logger.error('[projects] Error getting project', error);
      return res.status(500).json({ error: 'Error getting project' });
    }
  }

  async function updateProject(req: ProjectRequest, res: Response): Promise<Response> {
    const { projectId } = req.params;
    if (!isValidObjectIdString(projectId)) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }

    const input: UpdateChatProjectInput = {};
    if (req.body?.name !== undefined) {
      const name = normalizeString(req.body.name);
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      input.name = name;
    }
    if (req.body?.description !== undefined) {
      input.description = typeof req.body.description === 'string' ? req.body.description : '';
    }
    if (req.body?.instructions !== undefined) {
      input.instructions = typeof req.body.instructions === 'string' ? req.body.instructions : '';
    }

    try {
      const project = await deps.updateChatProject(getUserId(req), projectId, input);
      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }
      return res.status(200).json(project);
    } catch (error) {
      logger.error('[projects] Error updating project', error);
      return res.status(500).json({ error: 'Error updating project' });
    }
  }

  async function deleteProject(req: ProjectRequest, res: Response): Promise<Response> {
    const { projectId } = req.params;
    if (!isValidObjectIdString(projectId)) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }

    try {
      const result = await deps.deleteChatProject(getUserId(req), projectId);
      if (!result.deletedCount) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }
      return res.status(200).json(result);
    } catch (error) {
      logger.error('[projects] Error deleting project', error);
      return res.status(500).json({ error: 'Error deleting project' });
    }
  }

  async function listProjectFiles(req: ProjectRequest, res: Response): Promise<Response> {
    const { projectId } = req.params;
    if (!isValidObjectIdString(projectId)) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }

    try {
      const userId = getUserId(req);
      const project = await deps.getChatProject(userId, projectId);
      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      const files = await deps.getFiles(
        { chatProjectId: projectId, user: userId } as FilterQuery<IMongoFile>,
        null,
        { text: 0 },
      );
      return res.status(200).json(files ?? []);
    } catch (error) {
      logger.error('[projects] Error listing project files', error);
      return res.status(500).json({ error: 'Error listing project files' });
    }
  }

  async function getProjectKnowledgeBudget(req: ProjectRequest, res: Response): Promise<Response> {
    const { projectId } = req.params;
    if (!isValidObjectIdString(projectId)) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }

    const model = queryString(req.query.model);
    const endpoint = queryString(req.query.endpoint);
    if (!model || !endpoint) {
      return res.status(400).json({ error: 'model and endpoint are required' });
    }

    try {
      const userId = getUserId(req);
      const project = await deps.getChatProject(userId, projectId);
      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      const instructionsText = project.instructions?.trim() ?? '';
      const instructionsTokens = instructionsText ? await countTokens(instructionsText) : 0;

      const knowledgeFileIds = project.knowledgeFileIds ?? [];
      const files =
        knowledgeFileIds.length > 0
          ? ((await deps.getFiles(
              { file_id: { $in: knowledgeFileIds }, user: userId } as FilterQuery<IMongoFile>,
              null,
              { file_id: 1, filename: 1, text: 1 },
            )) ?? [])
          : [];

      const fileBreakdown = await Promise.all(
        files.map(async (file) => ({
          file_id: file.file_id,
          filename: file.filename,
          tokens: file.text ? await countTokens(file.text) : 0,
        })),
      );

      const totalTokens =
        instructionsTokens + fileBreakdown.reduce((sum, file) => sum + file.tokens, 0);
      const maxContextTokens = getModelMaxTokens(model, endpoint as EModelEndpoint);

      return res.status(200).json({
        instructionsTokens,
        files: fileBreakdown,
        totalTokens,
        maxContextTokens: maxContextTokens ?? null,
      });
    } catch (error) {
      logger.error('[projects] Error computing project knowledge budget', error);
      return res.status(500).json({ error: 'Error computing project knowledge budget' });
    }
  }

  return {
    listProjects,
    createProject,
    assignConversationToProject,
    getProject,
    updateProject,
    deleteProject,
    listProjectFiles,
    getProjectKnowledgeBudget,
  };
}
