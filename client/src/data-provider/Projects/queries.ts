import { dataService, QueryKeys } from 'librechat-data-provider';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  ProjectListParams,
  ProjectListResponse,
  TProjectKnowledgeBudgetResponse,
  TChatProject,
  TFile,
} from 'librechat-data-provider';
import type {
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query';

export const useProjectsInfiniteQuery = (
  params: ProjectListParams = {},
  config?: UseInfiniteQueryOptions<ProjectListResponse, unknown>,
) => {
  const { sortBy, sortDirection, search, limit } = params;

  return useInfiniteQuery<ProjectListResponse>({
    queryKey: [QueryKeys.projects, { sortBy, sortDirection, search, limit }],
    queryFn: ({ pageParam }) =>
      dataService.listProjects({
        sortBy,
        sortDirection,
        search,
        limit,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    ...config,
  });
};

export const useProjectQuery = (
  projectId?: string | null,
  config?: UseQueryOptions<TChatProject>,
): QueryObserverResult<TChatProject, unknown> => {
  return useQuery<TChatProject>(
    [QueryKeys.project, projectId],
    () => dataService.getProjectById(projectId ?? ''),
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useProjectKnowledgeFilesQuery = (
  projectId?: string | null,
  config?: UseQueryOptions<TFile[]>,
): QueryObserverResult<TFile[], unknown> => {
  return useQuery<TFile[]>(
    [QueryKeys.projectFiles, projectId],
    () => dataService.getProjectFiles(projectId ?? ''),
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useProjectKnowledgeBudgetQuery = (
  projectId: string | null | undefined,
  config?: UseQueryOptions<TProjectKnowledgeBudgetResponse>,
): QueryObserverResult<TProjectKnowledgeBudgetResponse, unknown> => {
  return useQuery<TProjectKnowledgeBudgetResponse>(
    [QueryKeys.projectKnowledgeBudget, projectId],
    () => dataService.getProjectKnowledgeBudget(projectId ?? ''),
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};
