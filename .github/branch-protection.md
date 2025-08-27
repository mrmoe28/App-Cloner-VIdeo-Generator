# Branch Protection Configuration

To ensure code quality and safe deployments, configure these branch protection rules for the `main` branch:

## 🛡️ Recommended Settings

Go to **GitHub Repository → Settings → Branches → Add rule** for `main`:

### ✅ Basic Protection
- [x] **Require pull request reviews before merging**
  - Required approving reviews: 1
  - [x] Dismiss stale reviews when new commits are pushed
  - [x] Require review from code owners (if you have CODEOWNERS file)

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Required status checks:
    - `deploy` (GitHub Actions)
    - `lighthouse` (Performance testing)

### 🚫 Restrictions
- [x] **Restrict pushes that create files**
- [x] **Require conversation resolution before merging**
- [x] **Require signed commits** (recommended for security)

### 👥 Administrative Settings
- [ ] Include administrators (disable for easier maintenance)
- [x] **Allow force pushes** → Everyone (for emergency fixes)
- [x] **Allow deletions** (for branch cleanup)

## 🔄 Deployment Workflow

With these settings, your deployment process becomes:

1. **Create feature branch** from `main`
2. **Make changes** and commit
3. **Create pull request** to `main`
4. **Automatic checks run**:
   - ESLint code quality checks
   - Vercel preview deployment
   - Lighthouse performance testing
5. **Review and approve** PR
6. **Merge to main** → Automatic production deployment!

## 📋 Optional: CODEOWNERS File

Create `.github/CODEOWNERS` to automatically request reviews from specific people:

```
# Global code owners
* @mrmoe28

# Frontend changes
public/ @frontend-team
*.html @frontend-team
*.css @frontend-team

# Backend/API changes  
lib/ @backend-team
server.js @backend-team
api/ @backend-team

# Configuration changes
.github/ @devops-team
vercel.json @devops-team
package.json @devops-team

# Documentation
*.md @docs-team
```

## 🚨 Emergency Procedures

If you need to bypass protection rules:
1. Temporarily disable branch protection
2. Make emergency fix directly to `main`
3. Re-enable protection rules
4. Create follow-up PR with proper testing

**Note:** Admins can always bypass these rules if needed, but following the process ensures code quality and reduces deployment risks.