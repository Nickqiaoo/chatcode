import { Config } from '../config/config';
import { UserSessionModel } from '../models/user-session';

export class AuthService {
  constructor(private config: Config) {}

  /**
   * Check if secret verification is required
   */
  isSecretRequired(): boolean {
    return this.config.security.secretRequired;
  }

  /**
   * Verify the provided secret against the stored secret
   */
  verifySecret(providedSecret: string): boolean {
    if (!this.config.security.secretToken) {
      return false;
    }
    return providedSecret === this.config.security.secretToken;
  }

  /**
   * Check if user is authenticated for sensitive operations
   */
  isUserAuthenticated(user: UserSessionModel): boolean {
    if (!this.isSecretRequired()) {
      return true; // No authentication required
    }
    return user.isAuthenticated();
  }

  /**
   * Authenticate user with secret
   */
  authenticateUser(user: UserSessionModel, secret: string): boolean {
    if (!this.isSecretRequired()) {
      user.setAuthenticated(true);
      return true;
    }

    if (this.verifySecret(secret)) {
      user.setAuthenticated(true);
      return true;
    }

    return false;
  }

  /**
   * Get authentication error message
   */
  getAuthErrorMessage(): string {
    return '🔐 Authentication required. Please provide the secret token to access this feature.';
  }

  /**
   * Get secret prompt message
   */
  getSecretPromptMessage(): string {
    return '🔑 Please enter the secret token with auth command';
  }
}