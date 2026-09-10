import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys, DynamicQueryKeys } from 'librechat-data-provider';
import type {
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type {
  TFile,
  ProjectListParams,
  ProjectListResponse,
  TChatProject,
} from 'librechat-data-provider';

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

export const useProjectFilesQuery = (
  projectId?: string | null,
  config?: UseQueryOptions<TFile[]>,
): QueryObserverResult<TFile[], unknown> => {
  return useQuery<TFile[]>(
    DynamicQueryKeys.projectFiles(projectId ?? ''),
    () => (projectId ? dataService.getProjectFiles(projectId) : Promise.resolve([])),
    {
      enabled: Boolean(projectId),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
