import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

function workerCount() {
  const configured = Number(process.env.WEB_CONCURRENCY);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
}

if (cluster.isPrimary) {
  const workers = workerCount();
  console.log(`Starting ${workers} shortlink workers.`);

  for (let index = 0; index < workers; index += 1) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (worker.exitedAfterDisconnect) return;
    console.error(
      `Worker ${worker.process.pid ?? 'unknown'} exited (${code ?? signal}); restarting.`,
    );
    cluster.fork();
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      for (const worker of Object.values(cluster.workers ?? {})) {
        worker?.disconnect();
      }
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
} else {
  await import('../build/index.js');
}
