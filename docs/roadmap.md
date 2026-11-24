# Roadmap

Planned work for project-pilot, not yet implemented.

- Email notifications for password reset (the reset token is currently stored hashed in the database with no delivery; see [configuration.md](configuration.md#password-reset))
- Request logging (structured access / error logs)
- User profile management (display name, avatar)
- Session management: per-session list and single-session revoke (revoking all other sessions exists, see [api.md](api.md))
