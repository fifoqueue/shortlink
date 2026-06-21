import type { PluginConfig } from '$lib/plugin-contracts';
import type { PublicCaptchaChallenge } from '$lib/public-plugin-slots';

export function captchaChallengeFromConfig(
  config: PluginConfig,
): PublicCaptchaChallenge | null {
  const challenge = config.challenge;
  if (
    typeof challenge === 'object' &&
    challenge !== null &&
    'provider' in challenge &&
    'siteKey' in challenge &&
    'tokenFieldName' in challenge &&
    'scriptUrl' in challenge &&
    'actions' in challenge
  ) {
    return challenge as PublicCaptchaChallenge;
  }
  return null;
}
