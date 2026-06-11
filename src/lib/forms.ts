import type { SubmitFunction } from '@sveltejs/kit';

export const keepFormValues: SubmitFunction = () => {
  return async ({ update }) => {
    await update({ reset: false });
  };
};
