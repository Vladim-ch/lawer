import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";

/**
 * Middleware for role-based access control.
 * Must be used AFTER authMiddleware (requires req.user to be set).
 *
 * Usage:
 *   router.use(requireRole('admin'))
 *   router.get('/path', requireRole('admin', 'lawyer'), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Требуется авторизация" });
      return;
    }

    const userRole = req.user.role as UserRole;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ error: "Недостаточно прав для выполнения этого действия" });
      return;
    }

    next();
  };
}
