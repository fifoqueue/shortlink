import type { Actions, PageServerLoad } from './$types';
import {
  handleRecoveryEmailRequest,
  loadRecoveryEmailRequestPage,
} from '$lib/server/auth-email-request';
import { requestVerificationResend } from '$lib/server/account-recovery';

export const load: PageServerLoad = (event) =>
  loadRecoveryEmailRequestPage(event, 'resendVerification');

export const actions: Actions = {
  request: (event) =>
    handleRecoveryEmailRequest(event, 'resendVerification', (context) =>
      requestVerificationResend(context),
    ),
};
