# Security Policy

## Supported Versions

We take security seriously. Currently supported versions for security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We appreciate responsible disclosure of security vulnerabilities. If you believe you have found a security vulnerability in pg-agent-memory, please report it to us as described below.

### Reporting Process

**Please do NOT report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please send an email to: alex.potapenko.dev@gmail.com

Please include the following information:
- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Status Updates**: We will send status updates every 5 business days until resolution
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### What to Expect

- We will respond to your report and may ask for additional information
- We will keep you informed of our progress toward resolving the issue
- We may ask if you would like to be credited for the discovery
- We will notify you when the issue is fixed

## Security Considerations

### Database Security

- **Connection Strings**: Never log or expose PostgreSQL connection strings
- **Credentials**: Use environment variables or secure credential management
- **Network**: Use SSL/TLS connections to PostgreSQL in production
- **Access Control**: Follow principle of least privilege for database access

### Memory Management

- **Sensitive Data**: Memory contents are automatically cleaned up on process exit
- **Logging**: We never log conversation content or memory data
- **Encryption**: Consider encryption at rest for sensitive memory data

### Input Validation

- **SQL Injection**: All database queries use parameterized statements
- **Content Sanitization**: User content is validated before storage
- **Size Limits**: Built-in protection against oversized inputs

## Security Best Practices

When using pg-agent-memory in production:

1. **Environment Variables**: Store sensitive configuration in environment variables
2. **Database Security**: Use dedicated database users with minimal required permissions
3. **Network Security**: Ensure PostgreSQL is not exposed to the public internet
4. **Monitoring**: Monitor for unusual access patterns or query volumes
5. **Updates**: Keep pg-agent-memory and its dependencies up to date

## Scope

This security policy applies to:
- The pg-agent-memory npm package
- Official documentation and examples
- Associated build and deployment tools

This policy does not apply to:
- Third-party dependencies (report to their respective maintainers)
- Applications built using pg-agent-memory (unless the vulnerability is in our code)
- Infrastructure or hosting platforms

## Safe Harbor

We support safe harbor for security researchers who:
- Make a good faith effort to avoid privacy violations and data destruction
- Only interact with their own accounts or test accounts
- Do not access or modify data belonging to others
- Do not exploit vulnerabilities beyond the minimum necessary to demonstrate the issue
- Report vulnerabilities promptly
- Do not violate any applicable laws or regulations

## Recognition

We believe in recognizing the efforts of security researchers. With your permission, we will:
- Credit you in our security advisories
- Include your name in our acknowledgments
- Provide a brief description of the issue you found (if desired)

Thank you for helping keep pg-agent-memory and its users safe!