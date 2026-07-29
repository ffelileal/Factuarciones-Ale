export interface Job<T> {
  id: string;
  type: string;
  payload: T;
  priority: number;
  retries: number;
  maxRetries: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  error?: string;
  createdAt: Date;
}

export interface IJobQueue {
  enqueue<T>(type: string, payload: T, priority: number): Promise<Job<T>>;
  cancel(jobId: string): Promise<boolean>;
  getJobStatus(jobId: string): Promise<Job<any> | null>;
}
