import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { config } from "../config";
import { asyncHandler, HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { loginSchema } from "../validators/schemas";
import { User } from "../types";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
    if (!user) {
      throw new HttpError(401, "Invalid username or password");
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new HttpError(401, "Invalid username or password");
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        display_name: user.display_name,
        can_override_reviews: user.can_override_reviews,
      },
    });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = db
      .prepare("SELECT id, username, role, display_name, can_override_reviews, created_at FROM users WHERE id = ?")
      .get(req.user!.sub);
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    res.json(user);
  }),
);
