import {
  getAuth, signInWithPopup, GoogleAuthProvider,
  signOut as fbSignOut, onAuthStateChanged, User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';

export type UserRole = 'admin' | 'user';

export interface AppUser {
  uid:         string;
  email:       string | null;
  displayName: string | null;
  photoURL:    string | null;
  role:        UserRole;
}

class AuthService extends EventTarget {
  private _auth = getAuth(app);
  private _user: AppUser | null = null;
  private _loading = true;

  constructor() {
    super();
    onAuthStateChanged(this._auth, async firebaseUser => {
      if (firebaseUser) {
        const role = await this._fetchOrCreateRole(firebaseUser);
        this._user = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL:    firebaseUser.photoURL,
          role,
        };
      } else {
        this._user = null;
      }
      this._loading = false;
      this.dispatchEvent(new CustomEvent('auth-changed'));
    });
  }

  get user()    { return this._user; }
  get loading() { return this._loading; }
  get isAdmin() { return this._user?.role === 'admin'; }

  async signIn() {
    await signInWithPopup(this._auth, new GoogleAuthProvider());
  }

  async signOut() {
    await fbSignOut(this._auth);
  }

  private async _fetchOrCreateRole(user: User): Promise<UserRole> {
    try {
      const ref  = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return (snap.data()['role'] as UserRole) ?? 'user';
      }
      // First sign-in — create user document with default role
      await setDoc(ref, {
        email:       user.email,
        displayName: user.displayName,
        role:        'user',
        createdAt:   Date.now(),
      });
      return 'user';
    } catch {
      return 'user';
    }
  }
}

export const authService = new AuthService();
