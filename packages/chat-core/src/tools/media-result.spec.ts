import { describe, expect, it } from 'vitest';
import { isWorkloadResultApiPath, workloadResultPathsNeedFileUrl } from './media-result.js';

describe('workload result image urls', () => {
  it('treats the extensionless inference result path as not displayable', () => {
    const src = '/api/inference/workloads/1f1161cb-343f-43ac-b61d-b25d0533a3d1/result';
    expect(isWorkloadResultApiPath(src)).toBe(true);
    expect(workloadResultPathsNeedFileUrl([{ imageUrl: src }])).toBe(true);
  });

  it('keeps a preview file URL', () => {
    const src = 'https://gateway.example/files/file-1/preview.png?exp=1&sig=abc';
    expect(isWorkloadResultApiPath(src)).toBe(false);
    expect(workloadResultPathsNeedFileUrl([{ imageUrl: src }])).toBe(false);
  });
});
