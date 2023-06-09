import { StatusCodes } from 'http-status-codes';
import {
  validateRegisterInput,
  validateLoginInput,
} from '../config/validators';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import mailgun from 'mailgun-js';

import User from '../models/user';

export const register = async (req: Request, res: Response) => {
  let { username, email, password, confirmPassword } = req.body;

  const { errors, valid } = validateRegisterInput(
    username,
    email,
    password,
    confirmPassword
  );
  if (valid) {
    let exist = await User.findOne({ username });
    if (exist) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        errors: {
          username: `User with username ${username} already exist`,
        },
      });
    }
    exist = await User.findOne({ email });
    if (exist) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        errors: {
          email: `User with email ${email} already exist`,
        },
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(req.body.password, salt);
    const newUser = new User({ email, username, password: hashed });
    const savedUser = (await newUser.save()).toObject();
    const { password, ...user } = savedUser;
    const response = { message: 'User Register successfully', data: user };
    return response;

  } else {
    res.status(StatusCodes.BAD_REQUEST).json({ errors });
  }
};

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const { errors, valid } = validateLoginInput(username, password);

  if (valid) {
    let user = await User.findOne({
      username,
    })
      .populate('friends', 'username profilePicture')
      .populate('friendRequests', 'from to createdAt')
      .populate('messageNotifications', 'createdAt conversation from to')
      .populate('postNotifications', 'post createdAt user type');
    user = await User.populate(user, {
      path: 'friendRequests.from',
      select: 'username profilePicture',
    });
    user = await User.populate(user, {
      path: 'friendRequests.to',
      select: 'username profilePicture',
    });
    user = await User.populate(user, {
      path: 'messageNotifications.from',
      select: 'username profilePicture',
    });
    user = await User.populate(user, {
      path: 'postNotifications.user',
      select: 'username profilePicture',
    });
    if (!user) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        errors: {
          username: `User with username ${username} not found`,
        },
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        errors: {
          password: `Password is incorrect`,
        },
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.set(
      'Set-Cookie',
      cookie.serialize('token', token, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 3600 * 24 * 7,
        path: '/',
      })
    );

    res.status(StatusCodes.OK).json({
      // @ts-ignore
      ...user._doc,
    });
  } else {
    res.status(StatusCodes.BAD_REQUEST).json({ errors });
  }
};

export const logout = (req: Request, res: Response) => {
  res.set(
    'Set-Cookie',
    cookie.serialize('token', '', {
      httpOnly: true,
      secure: true,
      maxAge: +new Date(0),
      sameSite: 'none',
      path: '/',
    })
  );
  res.json({ message: 'Logout' });
};

