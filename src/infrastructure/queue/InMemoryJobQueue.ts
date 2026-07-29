import { IJobQueue, Job } from './IJobQueue';

export class InMemoryJobQueue implements IJobQueue {
  private static instance: InMemoryJobQueue;
  private queue: Job<any>[] = [];
  private dlq: Job<any>[] = []; // Dead Letter Queue
  private activeWorkers = 0;
  private readonly maxConcurrency = 2;

  private constructor() {
    // Start queue processing loop
    setInterval(() => this.processQueue(), 1000);
  }

  public static getInstance(): InMemoryJobQueue {
    if (!InMemoryJobQueue.instance) {
      InMemoryJobQueue.instance = new InMemoryJobQueue();
    }
    return InMemoryJobQueue.instance;
  }

  public async enqueue<T>(type: string, payload: T, priority: number): Promise<Job<T>> {
    const job: Job<T> = {
      id: Math.random().toString(36).substring(7),
      type,
      payload,
      priority,
      retries: 0,
      maxRetries: 3,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date(),
    };

    console.log(`[JobQueue] Encolando trabajo '${type}' con prioridad ${priority}, id: ${job.id}`);
    this.queue.push(job);
    // Sort by priority (higher number = higher priority) and then by creation date
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
    
    return job;
  }

  public async cancel(jobId: string): Promise<boolean> {
    const job = this.queue.find(j => j.id === jobId);
    if (job && (job.status === 'PENDING' || job.status === 'RUNNING')) {
      job.status = 'CANCELLED';
      console.log(`[JobQueue] Trabajo ${jobId} cancelado.`);
      return true;
    }
    return false;
  }

  public async getJobStatus(jobId: string): Promise<Job<any> | null> {
    const job = this.queue.find(j => j.id === jobId) || this.dlq.find(j => j.id === jobId);
    return job || null;
  }

  public getDLQ(): Job<any>[] {
    return [...this.dlq];
  }

  private async processQueue(): Promise<void> {
    if (this.activeWorkers >= this.maxConcurrency) return;

    const nextJob = this.queue.find(j => j.status === 'PENDING');
    if (!nextJob) return;

    this.activeWorkers++;
    nextJob.status = 'RUNNING';
    console.log(`[JobQueue] Iniciando procesamiento de trabajo ${nextJob.id} ('${nextJob.type}')`);

    // Simulate work based on job type
    this.simulateWork(nextJob)
      .then(() => {
        nextJob.status = 'COMPLETED';
        nextJob.progress = 100;
        console.log(`[JobQueue] Trabajo ${nextJob.id} completado con éxito.`);
      })
      .catch(async (err: any) => {
        nextJob.retries++;
        nextJob.error = err.message;
        nextJob.progress = 0;
        if (nextJob.retries >= nextJob.maxRetries) {
          nextJob.status = 'FAILED';
          console.error(`[JobQueue] Trabajo ${nextJob.id} falló definitivamente tras ${nextJob.maxRetries} intentos. Enviando a DLQ.`);
          this.dlq.push(nextJob);
          this.queue = this.queue.filter(j => j.id !== nextJob.id);
        } else {
          nextJob.status = 'PENDING';
          console.warn(`[JobQueue] Trabajo ${nextJob.id} falló temporalmente: ${err.message}. Reintentando (${nextJob.retries}/${nextJob.maxRetries})`);
        }
      })
      .finally(() => {
        this.activeWorkers--;
        this.processQueue(); // Loop
      });
  }

  private simulateWork(job: Job<any>): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentProgress = 0;
      const interval = setInterval(() => {
        if (job.status === 'CANCELLED') {
          clearInterval(interval);
          reject(new Error("Trabajo cancelado por el usuario."));
          return;
        }

        currentProgress += 20;
        job.progress = currentProgress;
        console.log(`[JobQueue] Progreso de trabajo ${job.id}: ${currentProgress}%`);

        if (currentProgress >= 100) {
          clearInterval(interval);
          // Simulate random failure for DLQ verification if requested in payload
          if (job.payload && (job.payload as any).shouldFail) {
            reject(new Error("Fallo de simulación provocado."));
          } else {
            resolve();
          }
        }
      }, 500);
    });
  }
}
