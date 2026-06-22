import type { Actions, PageServerLoad } from './$types';
import {
  handleRecoveryEmailRequest,
  loadRecoveryEmailRequestPage,
} from '$lib/server/auth-email-request';
import { requestPasswordReset } from '$lib/server/account-recovery';

export const load: PageServerLoad = (event) =>
  loadRecoveryEmailRequestPage(event, 'passwordReset');

export const actions: Actions = {
  request: (event) =>
    handleRecoveryEmailRequest(event, 'passwordReset', (context) =>
      requestPasswordReset(context),
    ),
};
