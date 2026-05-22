# Capacitor Mobile App Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task.

**Goal:** Build a focused Android mobile app (Capacitor + Svelte 5) for meter readers to capture readings, view history, and check billings in the field.

**Architecture:** Standalone Svelte SPA (no SvelteKit) in `mobile/` folder, reusing API client and types from the web app. Hash-based routing, native camera integration via Capacitor Camera plugin, no OCR/storage for now.

**Tech Stack:** Svelte 5, Vite, Capacitor, Firebase Auth, @capacitor/camera, Tailwind v4

---

## File Structure

### Files to Create

**API (`api/functions/`):**
- `src/features/user/user.dto.ts` — CreateUserDTO schema
- `src/features/user/user.controller.ts` — POST /users handler
- `src/features/user/user.route.ts` — Express router
- `src/features/user/user.test.ts` — Jest tests

**UI (`ui/`):**
- `src/lib/api/users.ts` — POST /users API client wrapper
- `src/lib/components/shared/ImagePreview.svelte` — interactive photo preview
- Tests for settings page changes

**Mobile (`mobile/`):**
- Full Svelte + Vite + Capacitor app structure (see task breakdown)

### Files to Modify

**API:**
- `api/functions/src/features/reading/reading.route.ts` — add 'assistant' to requireRole
- `api/functions/src/index.ts` — mount user router

**UI:**
- `ui/src/routes/(app)/settings/users/+page.svelte` — add role selector + POST /users call
- `ui/src/routes/(app)/readings/+page.svelte` — remove Suggest button + integrate ImagePreview

---

## Tasks

### Task 1: API — Add assistant role to readings write routes

**Files:**
- Modify: `api/functions/src/features/reading/reading.route.ts:28-47`

**Context:**  
Currently, POST /readings, POST /readings/batch, and POST /readings/ocr require `requireRole('admin', 'landlord')`. Mobile users will have the `assistant` role, so we need to add it to these three routes.

- [ ] **Step 1: Open reading.route.ts and locate the three requireRole calls**

File: `api/functions/src/features/reading/reading.route.ts`

Current lines 28–47 (POST /ocr, POST /batch, PATCH /batch routes). The single POST / doesn't have requireRole (all authenticated users can create individual readings).

- [ ] **Step 2: Update the three requireRole calls to include 'assistant'**

Replace:
```ts
router.post(
  "/ocr",
  validateRequest({body: OcrReadingDTOSchema}),
  requireRole('admin', 'landlord'),
  ocrReading
);

router.post(
  "/batch",
  validateRequest({body: CreateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord'),
  createBatchReadings
);

router.patch(
  "/batch",
  validateRequest({body: UpdateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord'),
  updateBatchReadings
);
```

With:
```ts
router.post(
  "/ocr",
  validateRequest({body: OcrReadingDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  ocrReading
);

router.post(
  "/batch",
  validateRequest({body: CreateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  createBatchReadings
);

router.patch(
  "/batch",
  validateRequest({body: UpdateReadingBatchDTOSchema}),
  requireRole('admin', 'landlord', 'assistant'),
  updateBatchReadings
);
```

- [ ] **Step 3: Run type check to verify no compilation errors**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add api/functions/src/features/reading/reading.route.ts
git commit -m "feat(api): allow assistant role to create and batch readings"
```

---

### Task 2: API — Create POST /users endpoint (DTO)

**Files:**
- Create: `api/functions/src/features/user/user.dto.ts`

**Context:**  
The settings UI will call `POST /users` to pre-seed a Firestore user profile with the correct role immediately after Firebase Auth user creation. This DTO validates the request body.

- [ ] **Step 1: Create user.dto.ts file**

```ts
import { z } from 'zod';

export const CreateUserDTOSchema = z.object({
  uid: z.string().min(1, 'uid is required'),
  role: z.enum(['admin', 'landlord', 'assistant'], {
    message: 'role must be admin, landlord, or assistant'
  })
});

export type CreateUserDTO = z.infer<typeof CreateUserDTOSchema>;
```

- [ ] **Step 2: Run type check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/functions/src/features/user/user.dto.ts
git commit -m "feat(api): add CreateUserDTO schema for user role assignment"
```

---

### Task 3: API — Create POST /users endpoint (Controller)

**Files:**
- Create: `api/functions/src/features/user/user.controller.ts`

**Context:**  
The controller handles the HTTP logic: validate the DTO, check if the user profile already exists, create or update it with the specified role.

- [ ] **Step 1: Create user.controller.ts**

```ts
import { Request, Response } from 'express';
import { CreateUserDTOSchema, CreateUserDTO } from './user.dto';
import { userRepository } from '../auth/auth.repository';
import { AppError } from '../../utils/error.util';

export async function createUser(req: Request<{}, {}, CreateUserDTO>, res: Response) {
  const { uid, role } = req.body;

  // Check if user profile already exists
  const existing = await userRepository.getById(uid);
  if (existing && !existing.is_deleted) {
    throw new AppError(409, 'User profile already exists');
  }

  // Create or restore the user profile with the specified role
  const user = await userRepository.create({
    id: uid,
    user_id: uid,
    email: '',
    display_name: '',
    role,
    created_at: new Date(),
    updated_at: new Date()
  });

  res.status(201).json(user);
}
```

- [ ] **Step 2: Run type check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/functions/src/features/user/user.controller.ts
git commit -m "feat(api): add user controller for POST /users endpoint"
```

---

### Task 4: API — Create POST /users endpoint (Route)

**Files:**
- Create: `api/functions/src/features/user/user.route.ts`

**Context:**  
The route file wires up the HTTP endpoint, applies the DTO validation middleware, and gates it to admin-only access.

- [ ] **Step 1: Create user.route.ts**

```ts
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { requireRole } from '../../middlewares/require-role.middleware';
import { CreateUserDTOSchema } from './user.dto';
import { createUser } from './user.controller';

const router = Router();

router.post(
  '/',
  validateRequest({ body: CreateUserDTOSchema }),
  requireRole('admin'),
  createUser
);

export default router;
```

- [ ] **Step 2: Run type check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/functions/src/features/user/user.route.ts
git commit -m "feat(api): add user route for POST /users"
```

---

### Task 5: API — Mount user router in index.ts

**Files:**
- Modify: `api/functions/src/index.ts`

**Context:**  
The main app file mounts all feature routers. We need to add the user router.

- [ ] **Step 1: Read index.ts to find where routers are mounted**

Look for a pattern like:
```ts
import meterGroupRouter from './features/meter-group/meter-group.route';
// ...
app.use('/meter-groups', meterGroupRouter);
```

- [ ] **Step 2: Add the user router import and mount**

After the other feature router imports, add:
```ts
import userRouter from './features/user/user.route';
```

Then in the mount section (after other `app.use()`), add:
```ts
app.use('/users', userRouter);
```

- [ ] **Step 3: Run type check**

```bash
cd api/functions && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Start the API and test the endpoint manually (optional)**

```bash
cd api/functions && npm run dev:watch
# In another terminal, curl:
curl -X POST http://localhost:5002/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"uid":"test-user-id","role":"assistant"}'
```

Expected: 201 with the created user object (or error if not authenticated as admin).

- [ ] **Step 5: Commit**

```bash
git add api/functions/src/index.ts
git commit -m "feat(api): mount user router at /users"
```

---

### Task 6: API — Write tests for POST /users

**Files:**
- Create: `api/functions/src/features/user/user.test.ts`

**Context:**  
Jest tests to verify the POST /users endpoint works correctly: success case, 409 conflict, authorization.

- [ ] **Step 1: Create user.test.ts with failing tests**

```ts
/**
 * POST /users — Create/assign user role (admin only)
 *
 * Happy path:
 * - Admin creates new user with role=assistant → 201
 * - New user profile appears in Firestore with that role
 *
 * Error cases:
 * - User already exists → 409
 * - Invalid role → 400
 * - Non-admin tries to create user → 403
 * - Missing uid → 400
 */

describe('POST /users', () => {
  it('should create a user with the specified role', async () => {
    // GIVEN an admin user and a new uid
    const adminToken = 'valid-admin-token';
    const newUid = 'new-meter-reader-' + Date.now();

    // WHEN the admin calls POST /users
    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'assistant' })
    });

    // THEN the response is 201 and the user profile is created
    expect(response.status).toBe(201);
    const user = await response.json();
    expect(user.id).toBe(newUid);
    expect(user.role).toBe('assistant');
  });

  it('should return 409 if user profile already exists', async () => {
    // GIVEN an admin and an existing user
    const adminToken = 'valid-admin-token';
    const existingUid = 'existing-user-id';

    // WHEN the admin tries to create the user again
    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: existingUid, role: 'landlord' })
    });

    // THEN the response is 409
    expect(response.status).toBe(409);
  });

  it('should return 400 if role is invalid', async () => {
    const adminToken = 'valid-admin-token';
    const newUid = 'test-uid-' + Date.now();

    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'invalid-role' })
    });

    expect(response.status).toBe(400);
  });

  it('should return 403 if non-admin tries to create user', async () => {
    const assistantToken = 'valid-assistant-token';
    const newUid = 'test-uid-' + Date.now();

    const response = await fetch('http://localhost:5002/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${assistantToken}`
      },
      body: JSON.stringify({ uid: newUid, role: 'assistant' })
    });

    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests (they will fail)**

```bash
cd api/functions && npm test -- user.test.ts
```

Expected: All four tests fail (endpoints not fully wired yet or need proper test setup).

- [ ] **Step 3: Commit the test file**

```bash
git add api/functions/src/features/user/user.test.ts
git commit -m "test(api): add user endpoint tests"
```

---

### Task 7: UI — Add API client wrapper for POST /users

**Files:**
- Create: `ui/src/lib/api/users.ts`

**Context:**  
A thin wrapper that calls the API's `POST /users` endpoint. Used by the settings page after Firebase Auth user creation.

- [ ] **Step 1: Create users.ts**

```ts
import { apiPost } from './client';

export interface CreateUserRequest {
  uid: string;
  role: 'admin' | 'landlord' | 'assistant';
}

export async function createUser(data: CreateUserRequest) {
  return apiPost('/users', data);
}
```

- [ ] **Step 2: Run type check**

```bash
cd ui && npm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/lib/api/users.ts
git commit -m "feat(ui): add users API client module"
```

---

### Task 8: UI — Create reusable ImagePreview component

**Files:**
- Create: `ui/src/lib/components/shared/ImagePreview.svelte`

**Context:**  
A full-screen overlay component with touch gestures (pinch-to-zoom, pan, rotate). Used by both admin readings page and mobile app.

- [ ] **Step 1: Create ImagePreview.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let { imageUrl = '', onClose = () => {} } = $props();
  
  let container: HTMLDivElement;
  let img: HTMLImageElement;
  let scale = $state(1);
  let rotate = $state(0);
  let translateX = $state(0);
  let translateY = $state(0);
  
  let touchStartDistance = 0;
  let touchStartScale = 1;
  let panStartX = 0;
  let panStartY = 0;

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(1, Math.min(scale * delta, 5));
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch to zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      touchStartScale = scale;
    } else if (e.touches.length === 1) {
      // Pan
      panStartX = e.touches[0].clientX - translateX;
      panStartY = e.touches[0].clientY - translateY;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      scale = Math.max(1, Math.min((distance / touchStartDistance) * touchStartScale, 5));
    } else if (e.touches.length === 1) {
      translateX = e.touches[0].clientX - panStartX;
      translateY = e.touches[0].clientY - panStartY;
    }
  }

  function handleRotate() {
    rotate = (rotate + 90) % 360;
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
  <div bind:this={container} class="relative w-full h-full flex items-center justify-center overflow-hidden">
    <img
      bind:this={img}
      {imageUrl}
      alt="Preview"
      class="max-h-full max-w-full object-contain select-none"
      style="transform: translate({translateX}px, {translateY}px) scale({scale}) rotate({rotate}deg);"
      on:wheel={handleWheel}
      on:touchstart={handleTouchStart}
      on:touchmove={handleTouchMove}
    />
  </div>
  
  <div class="absolute top-4 right-4 flex gap-2 z-10">
    <button
      on:click={handleRotate}
      class="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200"
      aria-label="Rotate"
    >
      ↻
    </button>
    <button
      on:click={onClose}
      class="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200"
      aria-label="Close"
    >
      ✕
    </button>
  </div>
</div>

<style>
  img {
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
</style>
```

- [ ] **Step 2: Run type check**

```bash
cd ui && npm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/lib/components/shared/ImagePreview.svelte
git commit -m "feat(ui): add reusable interactive image preview component"
```

---

### Task 9: UI Settings — Add role selector to create user form

**Files:**
- Modify: `ui/src/routes/(app)/settings/users/+page.svelte`

**Context:**  
The settings create user form currently has email, display name, password. Add a role selector (Admin / Landlord / Assistant, default Assistant) and after Firebase Auth user creation, call `POST /users` to pre-seed the role.

- [ ] **Step 1: Read the current form**

Look at `ui/src/routes/(app)/settings/users/+page.svelte` to understand:
- Current form fields and structure
- Where the `createUserWithEmailAndPassword()` call happens
- Where to hook in the `POST /users` call

- [ ] **Step 2: Update the form to include role selector**

Add to the form (before the submit button):
```svelte
<div class="mb-4">
  <label for="role" class="block text-sm font-medium mb-1">Role</label>
  <select
    id="role"
    bind:value={role}
    class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    <option value="assistant">Assistant (Meter Reader)</option>
    <option value="landlord">Landlord</option>
    <option value="admin">Admin</option>
  </select>
</div>
```

Add state variable (with other state variables at top of script):
```ts
let role = $state('assistant');
```

- [ ] **Step 3: Add the POST /users call after Firebase Auth creation**

After `createUserWithEmailAndPassword()` succeeds, add:
```ts
// Pre-seed the user profile with the selected role
const { createUser } = await import('$lib/api/users');
try {
  await createUser({
    uid: newUser.user.uid,
    role: role as 'admin' | 'landlord' | 'assistant'
  });
} catch (err) {
  console.error('Failed to set user role:', err);
  // Optionally show error to user
}
```

- [ ] **Step 4: Run type check**

```bash
cd ui && npm run check
```

Expected: No errors.

- [ ] **Step 5: Test manually (if dev server is running)**

Run the dev server (`npm run dev` in ui/), navigate to settings > users, create a new user with role "Assistant", verify:
- Firebase Auth user is created
- POST /users call succeeds (check network tab)
- New user can log in with the assistant role

- [ ] **Step 6: Commit**

```bash
git add ui/src/routes/\(app\)/settings/users/+page.svelte
git commit -m "feat(ui): add role selector to create user form"
```

---

### Task 10: UI Readings — Remove Suggest button and add interactive photo preview

**Files:**
- Modify: `ui/src/routes/(app)/readings/+page.svelte`

**Context:**  
Remove the OCR suggest functionality since Gemini is not configured. Add the interactive image preview component for viewing meter photos.

- [ ] **Step 1: Locate the Suggest button in the readings page**

Look for the "Suggest" button in the batch form (likely in the "Photo / Suggest" column). Find the code that calls `ocrReadingImage()` and the button that triggers it.

- [ ] **Step 2: Remove the Suggest button and OCR logic**

Delete or comment out:
- The "Suggest" button HTML
- The handler function that calls `ocrReadingImage()`
- The `suggested_amount` display (if any)

Keep the photo thumbnail and upload functionality intact.

- [ ] **Step 3: Add ImagePreview component import**

```ts
import ImagePreview from '$lib/components/shared/ImagePreview.svelte';
```

- [ ] **Step 4: Add a showPhotoPreview state and handler**

```ts
let previewImageUrl = $state<string | null>(null);

function openPhotoPreview(imageUrl: string) {
  previewImageUrl = imageUrl;
}

function closePhotoPreview() {
  previewImageUrl = null;
}
```

- [ ] **Step 5: Make photo thumbnail clickable to open preview**

Update the photo thumbnail in the readings table to be clickable:
```svelte
{#if reading.image_url}
  <button
    on:click={() => openPhotoPreview(reading.image_url)}
    class="text-blue-600 underline hover:text-blue-800"
  >
    📷 View
  </button>
{/if}
```

- [ ] **Step 6: Add ImagePreview component to the page**

At the end of the page (before closing script tag or in the component body):
```svelte
{#if previewImageUrl}
  <ImagePreview
    imageUrl={previewImageUrl}
    onClose={closePhotoPreview}
  />
{/if}
```

- [ ] **Step 7: Run type check**

```bash
cd ui && npm run check
```

Expected: No errors.

- [ ] **Step 8: Test manually**

- Run the dev server, navigate to readings
- Upload or add a photo to a reading
- Click the photo thumbnail → full-screen preview should open with pinch/zoom/rotate controls
- Verify Suggest button is gone

- [ ] **Step 9: Commit**

```bash
git add ui/src/routes/\(app\)/readings/+page.svelte
git commit -m "feat(ui): remove OCR suggest button and add interactive photo preview"
```

---

### Task 11: Mobile — Scaffold project structure

**Files:**
- Create: Multiple files in `mobile/`

**Context:**  
Initialize a new Svelte 5 + Vite + Capacitor project structure.

- [ ] **Step 1: Create mobile directory and core files**

```bash
mkdir -p mobile
cd mobile
npm init -y
```

- [ ] **Step 2: Create package.json with dependencies**

```json
{
  "name": "utilitool-mobile",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "cap:add:android": "npx cap add android",
    "cap:open:android": "npx cap open android",
    "cap:sync": "npx cap sync"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.1.0",
    "@capacitor/core": "^6.1.0",
    "@sveltejs/vite-plugin-svelte": "^3.1.0",
    "svelte": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "dependencies": {
    "@capacitor/android": "^6.1.0",
    "@capacitor/camera": "^6.1.0"
  }
}
```

- [ ] **Step 3: Create Capacitor config**

`mobile/capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.utilitool.mobile',
  appName: 'Utilitool Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Camera: {
      saveToGallery: false,
      promptForCameraPermission: true
    }
  }
};

export default config;
```

- [ ] **Step 4: Create Vite config**

`mobile/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'esnext',
    minify: 'terser'
  },
  server: {
    port: 5174
  }
});
```

- [ ] **Step 5: Create index.html**

`mobile/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Utilitool Mobile</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create tsconfig.json**

`mobile/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "$lib/*": ["src/lib/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.svelte"]
}
```

- [ ] **Step 7: Create .gitignore**

`mobile/.gitignore`:
```
node_modules/
dist/
.capacitor/
android/
ios/
*.log
.env
.env.local
```

- [ ] **Step 8: Install dependencies**

```bash
cd mobile && npm install
```

Expected: No errors.

- [ ] **Step 9: Commit the scaffolding**

```bash
cd ../.. && git add mobile/
git commit -m "scaffold: initialize Capacitor mobile app structure"
```

---

### Task 12: Mobile — Set up Firebase and API client

**Files:**
- Create: `mobile/src/firebase.ts`
- Create: `mobile/src/lib/api/client.ts`
- Create: `mobile/src/lib/types/` (copy types)

**Context:**  
Copy Firebase configuration and API client from the web app to the mobile app. The API client will use the same Firebase Auth token pattern.

- [ ] **Step 1: Copy firebase.ts**

From `ui/src/firebase.ts` to `mobile/src/firebase.ts` (exact copy).

- [ ] **Step 2: Create minimal API client**

`mobile/src/lib/api/client.ts` (simplified from `ui/src/lib/api/client.ts`):
```ts
import { auth } from '../../firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002';

export async function getAccessToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    const retryToken = await auth.currentUser!.getIdToken(true);
    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, 'Authorization': `Bearer ${retryToken}` }
    });
  }

  return response;
}

export async function apiGet(endpoint: string) {
  const res = await request(endpoint, { method: 'GET' });
  return res.json();
}

export async function apiPost(endpoint: string, data: any) {
  const res = await request(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiPatch(endpoint: string, data: any) {
  const res = await request(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiDelete(endpoint: string) {
  return request(endpoint, { method: 'DELETE' });
}
```

- [ ] **Step 3: Create API modules for mobile**

Create these files (copy/adapt from ui/src/lib/api/):

`mobile/src/lib/api/meter-groups.ts`:
```ts
import { apiGet } from './client';

export async function getMeterGroups(filters?: any) {
  return apiGet(`/meter-groups?minimal=true&limit=100`);
}
```

`mobile/src/lib/api/properties.ts`:
```ts
import { apiGet } from './client';

export async function getProperties(meterGroupId: string) {
  return apiGet(`/properties?meterGroupId=${meterGroupId}&limit=100`);
}
```

`mobile/src/lib/api/readings.ts`:
```ts
import { apiPost } from './client';

export async function createReadingsBatch(readings: any[]) {
  return apiPost('/readings/batch', readings);
}
```

`mobile/src/lib/api/billings.ts`:
```ts
import { apiGet } from './client';

export async function getBillings(filters?: any) {
  return apiGet(`/billings?limit=50`);
}
```

- [ ] **Step 4: Copy types**

Copy `ui/src/lib/types/` to `mobile/src/lib/types/` (exact copy).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/
git commit -m "feat(mobile): set up Firebase and API client"
```

---

### Task 13: Mobile — Create Login screen

**Files:**
- Create: `mobile/src/screens/Login.svelte`

**Context:**  
Email + password login form using Firebase Auth. Navigates to home on success.

- [ ] **Step 1: Create Login.svelte**

```svelte
<script lang="ts">
  import { signInWithEmailAndPassword } from 'firebase/auth';
  import { auth } from '../firebase';
  
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    loading = true;
    error = '';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.hash = '#/home';
    } catch (err: any) {
      error = err.message || 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
  <div class="w-full max-w-md px-4">
    <div class="bg-white rounded-lg shadow-lg p-8">
      <h1 class="text-3xl font-bold text-center mb-8 text-gray-800">Utilitool</h1>
      
      <form on:submit|preventDefault={handleLogin} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            disabled={loading}
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="meter.reader@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            disabled={loading}
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {#if error}
          <div class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Run type check (if setup complete)**

```bash
cd mobile && npm run build 2>&1 | head -20
```

Expected: Should compile without errors (or show Svelte-specific warnings only).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Login.svelte
git commit -m "feat(mobile): create login screen"
```

---

### Task 14: Mobile — Create App router and Home screen

**Files:**
- Create: `mobile/src/main.ts`
- Create: `mobile/src/App.svelte`
- Create: `mobile/src/screens/Home.svelte`

**Context:**  
Hash-based router that switches between screens. Home screen with navigation buttons and bottom nav.

- [ ] **Step 1: Create main.ts**

`mobile/src/main.ts`:
```ts
import { CapacitorUpdater } from '@capacitor/updater';
import App from './App.svelte';

// Initialize Capacitor plugins
CapacitorUpdater.initialize();

const app = new App({
  target: document.getElementById('app')!
});

export default app;
```

- [ ] **Step 2: Create App.svelte (router)**

`mobile/src/App.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from './firebase';
  import Login from './screens/Login.svelte';
  import Home from './screens/Home.svelte';
  import CaptureReadings from './screens/CaptureReadings.svelte';
  import ReadingHistory from './screens/ReadingHistory.svelte';
  import Billings from './screens/Billings.svelte';

  let currentScreen = $state('login');
  let user = $state(auth.currentUser);

  onMount(() => {
    auth.onAuthStateChanged((newUser) => {
      user = newUser;
      if (newUser && currentScreen === 'login') {
        currentScreen = 'home';
      } else if (!newUser) {
        currentScreen = 'login';
      }
    });

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ['home', 'capture', 'history', 'billings'].includes(hash)) {
        currentScreen = hash;
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Check initial hash
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
</script>

{#if !user}
  <Login />
{:else if currentScreen === 'home'}
  <Home />
{:else if currentScreen === 'capture'}
  <CaptureReadings />
{:else if currentScreen === 'history'}
  <ReadingHistory />
{:else if currentScreen === 'billings'}
  <Billings />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
```

- [ ] **Step 3: Create Home.svelte**

`mobile/src/screens/Home.svelte`:
```svelte
<script lang="ts">
  import { auth } from '../firebase';

  function logout() {
    auth.signOut();
    window.location.hash = '#/login';
  }
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <!-- Header -->
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-2xl font-bold">Utilitool</h1>
    <p class="text-sm opacity-90">Meter Reading Assistant</p>
  </div>

  <!-- Main content -->
  <div class="p-4 space-y-4">
    <!-- Quick actions -->
    <div class="space-y-3">
      <a
        href="#/capture"
        class="block w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold text-center hover:bg-blue-700"
      >
        📱 New Reading Session
      </a>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-3 mt-8">
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-gray-600 text-sm">Recent Readings</p>
        <p class="text-2xl font-bold">—</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow">
        <p class="text-gray-600 text-sm">Pending Billings</p>
        <p class="text-2xl font-bold">—</p>
      </div>
    </div>
  </div>

  <!-- Bottom nav -->
  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-blue-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>

  <!-- Logout (optional, in settings) -->
  <div class="p-4 mt-12 border-t">
    <button on:click={logout} class="w-full px-4 py-2 text-red-600 font-semibold">
      Sign Out
    </button>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add mobile/src/main.ts mobile/src/App.svelte mobile/src/screens/Home.svelte
git commit -m "feat(mobile): add router and home screen"
```

---

### Task 15: Mobile — Create CaptureReadings screen (Step 1: Session Setup)

**Files:**
- Create: `mobile/src/screens/CaptureReadings.svelte` (Step 1 view)

**Context:**  
First screen of the capture flow: meter group selector and date picker.

- [ ] **Step 1: Create CaptureReadings.svelte with Step 1 UI**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getMeterGroups } from '../lib/api/meter-groups';
  import { getProperties } from '../lib/api/properties';
  
  let step = $state(1);
  let meterGroups = $state<any[]>([]);
  let selectedMeterGroup = $state('');
  let readingDate = $state(new Date().toISOString().split('T')[0]);
  let properties = $state<any[]>([]);
  let loading = $state(false);

  onMount(async () => {
    try {
      const result = await getMeterGroups();
      meterGroups = result.data || [];
    } catch (err) {
      console.error('Failed to load meter groups:', err);
    }
  });

  async function startSession() {
    if (!selectedMeterGroup) {
      alert('Please select a meter group');
      return;
    }

    loading = true;
    try {
      const result = await getProperties(selectedMeterGroup);
      properties = result.data || [];
      step = 2;
    } catch (err) {
      console.error('Failed to load properties:', err);
      alert('Failed to load properties');
    } finally {
      loading = false;
    }
  }

  function goBack() {
    window.location.hash = '#/home';
  }
</script>

{#if step === 1}
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-blue-600 text-white p-4 flex items-center gap-3">
      <button on:click={goBack} class="text-xl">←</button>
      <h1 class="text-xl font-bold">New Reading Session</h1>
    </div>

    <!-- Form -->
    <div class="p-4 space-y-6">
      <!-- Meter Group Selection -->
      <div>
        <label for="meter-group" class="block text-sm font-semibold text-gray-700 mb-2">
          Meter Group
        </label>
        <select
          id="meter-group"
          bind:value={selectedMeterGroup}
          disabled={loading}
          class="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">— Select a meter group —</option>
          {#each meterGroups as mg}
            <option value={mg.id}>{mg.meter_name}</option>
          {/each}
        </select>
      </div>

      <!-- Reading Date -->
      <div>
        <label for="reading-date" class="block text-sm font-semibold text-gray-700 mb-2">
          Reading Date
        </label>
        <input
          id="reading-date"
          type="date"
          bind:value={readingDate}
          disabled={loading}
          class="w-full px-4 py-3 border border-gray-300 rounded-lg"
        />
      </div>

      <!-- Submit -->
      <button
        on:click={startSession}
        disabled={loading || !selectedMeterGroup}
        class="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Start Session'}
      </button>
    </div>
  </div>
{:else if step === 2}
  <!-- Placeholder for Step 2 (to be implemented in next task) -->
  <div class="p-4 text-center py-8">Loading properties...</div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): add capture readings step 1 (session setup)"
```

---

### Task 16: Mobile — Create CaptureReadings screen (Step 2: Property Cards)

**Files:**
- Modify: `mobile/src/screens/CaptureReadings.svelte`

**Context:**  
Add Step 2 UI: scrollable property cards with camera button, reading input, and interactive photo preview.

- [ ] **Step 1: Add Camera plugin import and handler**

At top of CaptureReadings.svelte script:
```ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
```

Add camera handler:
```ts
let readings = $state<any[]>([]);
let previewImage = $state<string | null>(null);

async function capturePhoto(propertyIndex: number) {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      promptLabelPhoto: 'Take photo'
    });

    readings[propertyIndex].photoDataUrl = image.dataUrl;
    readings[propertyIndex].photoTaken = true;
  } catch (err) {
    console.error('Camera error:', err);
  }
}

function openPhotoPreview(dataUrl: string) {
  previewImage = dataUrl;
}

function closePhotoPreview() {
  previewImage = null;
}
```

- [ ] **Step 2: Initialize readings array when step 2 starts**

Modify the startSession function to initialize readings:
```ts
async function startSession() {
  // ... existing code ...
  properties = result.data || [];
  
  // Initialize readings state
  readings = properties.map(p => ({
    property_id: p.id,
    meter_group_id: selectedMeterGroup,
    reading_amount: null,
    reading_date: readingDate,
    photoDataUrl: null,
    photoTaken: false
  }));
  
  step = 2;
}
```

- [ ] **Step 3: Add Step 2 UI in the template**

Replace the Step 2 placeholder:
```svelte
{:else if step === 2}
  <div class="min-h-screen bg-gray-50 pb-24">
    <!-- Header -->
    <div class="bg-blue-600 text-white p-4 flex items-center gap-3">
      <button on:click={() => (step = 1)} class="text-xl">←</button>
      <h1 class="text-xl font-bold">Record Readings</h1>
    </div>

    <!-- Property Cards -->
    <div class="p-4 space-y-4">
      {#each properties as property, idx}
        <div class="bg-white rounded-lg p-4 border border-gray-200">
          <!-- Property Name -->
          <h3 class="font-semibold text-lg mb-4">{property.room_name}</h3>

          <!-- Photo Section -->
          <div class="mb-4">
            {#if readings[idx]?.photoTaken}
              <div class="relative mb-2">
                <button
                  on:click={() => openPhotoPreview(readings[idx].photoDataUrl)}
                  class="w-full aspect-video bg-gray-200 rounded-lg overflow-hidden"
                >
                  <img
                    src={readings[idx].photoDataUrl}
                    alt="Meter"
                    class="w-full h-full object-cover"
                  />
                </button>
                <button
                  on:click={() => capturePhoto(idx)}
                  class="absolute bottom-2 right-2 bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                  📷 Retake
                </button>
              </div>
            {:else}
              <button
                on:click={() => capturePhoto(idx)}
                class="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-center hover:border-blue-500"
              >
                📱 Tap to capture meter photo
              </button>
            {/if}
          </div>

          <!-- Reading Amount -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Reading Amount
            </label>
            <input
              type="number"
              bind:value={readings[idx].reading_amount}
              placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- Status -->
          {#if readings[idx]?.reading_amount}
            <div class="mt-2 text-green-600 font-semibold">✓ Complete</div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Next button -->
    <div class="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
      {#if readings.every(r => r.reading_amount)}
        <button
          on:click={() => (step = 3)}
          class="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
        >
          Review & Submit
        </button>
      {:else}
        <button
          disabled
          class="w-full px-4 py-3 bg-gray-300 text-gray-600 font-semibold rounded-lg opacity-50 cursor-not-allowed"
        >
          Complete all readings to continue
        </button>
      {/if}
    </div>
  </div>
```

- [ ] **Step 4: Add ImagePreview component at the end of the template**

```svelte
{#if previewImage}
  <ImagePreview
    imageUrl={previewImage}
    onClose={closePhotoPreview}
  />
{/if}
```

And import it at the top:
```ts
import ImagePreview from '../lib/components/shared/ImagePreview.svelte';
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): add capture readings step 2 (property cards + camera)"
```

---

### Task 17: Mobile — Create CaptureReadings screen (Step 3: Confirmation + Submit)

**Files:**
- Modify: `mobile/src/screens/CaptureReadings.svelte`

**Context:**  
Final step: review summary and submit all readings via POST /readings/batch.

- [ ] **Step 1: Add submit handler**

In the script section, add:
```ts
import { createReadingsBatch } from '../lib/api/readings';

let submitting = $state(false);
let submitError = $state('');

async function submitReadings() {
  submitting = true;
  submitError = '';
  
  try {
    const payload = readings.map(r => ({
      meter_group_id: r.meter_group_id,
      property_id: r.property_id,
      reading_amount: r.reading_amount,
      reading_date: new Date(r.reading_date)
      // Note: image_url NOT included (no Firebase Storage configured)
    }));

    await createReadingsBatch(payload);
    
    // Success
    alert('✓ All readings submitted successfully!');
    window.location.hash = '#/home';
  } catch (err: any) {
    submitError = err.message || 'Failed to submit readings';
    console.error('Submit error:', err);
  } finally {
    submitting = false;
  }
}
```

- [ ] **Step 2: Add Step 3 UI in the template**

Add after the Step 2 block:
```svelte
{:else if step === 3}
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-blue-600 text-white p-4 flex items-center gap-3">
      <button on:click={() => (step = 2)} class="text-xl">←</button>
      <h1 class="text-xl font-bold">Review & Submit</h1>
    </div>

    <!-- Summary -->
    <div class="p-4 space-y-4">
      <div class="bg-white rounded-lg p-4">
        <h3 class="font-semibold text-lg mb-4">Session Summary</h3>
        
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-600">Meter Group:</span>
            <span class="font-semibold">
              {meterGroups.find(m => m.id === selectedMeterGroup)?.meter_name}
            </span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">Reading Date:</span>
            <span class="font-semibold">{readingDate}</span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">Properties:</span>
            <span class="font-semibold">{properties.length}</span>
          </div>
          
          <div class="flex justify-between">
            <span class="text-gray-600">Readings Recorded:</span>
            <span class="font-semibold">{readings.filter(r => r.reading_amount).length}/{readings.length}</span>
          </div>
        </div>
      </div>

      <!-- Reading List -->
      <div class="space-y-2">
        <h4 class="font-semibold text-gray-700">Readings Details</h4>
        {#each readings as reading, idx}
          <div class="bg-white rounded-lg p-3 flex justify-between items-center">
            <span class="text-sm">{properties[idx]?.room_name}</span>
            <span class="font-semibold text-blue-600">{reading.reading_amount}</span>
          </div>
        {/each}
      </div>

      {#if submitError}
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {submitError}
        </div>
      {/if}
    </div>

    <!-- Submit Button -->
    <div class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-2">
      <button
        on:click={() => (step = 2)}
        disabled={submitting}
        class="flex-1 px-4 py-3 bg-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-400"
      >
        Back
      </button>
      <button
        on:click={submitReadings}
        disabled={submitting}
        class="flex-1 px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Confirm & Submit'}
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/CaptureReadings.svelte
git commit -m "feat(mobile): add capture readings step 3 (confirmation + submit)"
```

---

### Task 18: Mobile — Create ReadingHistory screen

**Files:**
- Create: `mobile/src/screens/ReadingHistory.svelte`

**Context:**  
List of past readings with filters and pagination.

- [ ] **Step 1: Create ReadingHistory.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getMeterGroups } from '../lib/api/meter-groups';

  let readings = $state<any[]>([]);
  let meterGroups = $state<any[]>([]);
  let selectedMeterGroup = $state('');
  let loading = $state(true);

  onMount(async () => {
    try {
      const result = await getMeterGroups();
      meterGroups = result.data || [];
    } catch (err) {
      console.error('Failed to load meter groups:', err);
    }
  });

  async function filterReadings() {
    if (!selectedMeterGroup) return;
    loading = true;
    try {
      // TODO: Implement actual API call with filters
      // const result = await getReadings({ meterGroupId: selectedMeterGroup });
      // readings = result.data || [];
      readings = []; // Placeholder
    } catch (err) {
      console.error('Failed to load readings:', err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <!-- Header -->
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-xl font-bold">Reading History</h1>
  </div>

  <!-- Filters -->
  <div class="p-4 bg-white border-b">
    <label class="block text-sm font-medium text-gray-700 mb-2">Meter Group</label>
    <select
      bind:value={selectedMeterGroup}
      on:change={filterReadings}
      class="w-full px-3 py-2 border border-gray-300 rounded-lg"
    >
      <option value="">All Meter Groups</option>
      {#each meterGroups as mg}
        <option value={mg.id}>{mg.meter_name}</option>
      {/each}
    </select>
  </div>

  <!-- Readings List -->
  <div class="p-4 space-y-3">
    {#if loading}
      <p class="text-center text-gray-500">Loading...</p>
    {:else if readings.length === 0}
      <p class="text-center text-gray-500 py-8">No readings found</p>
    {:else}
      {#each readings as reading}
        <div class="bg-white rounded-lg p-4 border border-gray-200">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold">{reading.property?.room_name}</h3>
            <span class="text-sm text-gray-600">{reading.meter_group?.meter_name}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p class="text-gray-600">Reading</p>
              <p class="font-semibold">{reading.reading_amount}</p>
            </div>
            <div>
              <p class="text-gray-600">Date</p>
              <p class="font-semibold">{reading.reading_date}</p>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom Nav -->
  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-blue-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-gray-600 font-semibold">💰 Billings</a>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/ReadingHistory.svelte
git commit -m "feat(mobile): add reading history screen"
```

---

### Task 19: Mobile — Create Billings screen

**Files:**
- Create: `mobile/src/screens/Billings.svelte`

**Context:**  
List of billings with pagination.

- [ ] **Step 1: Create Billings.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getBillings } from '../lib/api/billings';

  let billings = $state<any[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const result = await getBillings();
      billings = result.data || [];
    } catch (err) {
      console.error('Failed to load billings:', err);
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-gray-50 pb-20">
  <!-- Header -->
  <div class="bg-blue-600 text-white p-4">
    <h1 class="text-xl font-bold">Billings</h1>
  </div>

  <!-- Billings List -->
  <div class="p-4 space-y-3">
    {#if loading}
      <p class="text-center text-gray-500">Loading...</p>
    {:else if billings.length === 0}
      <p class="text-center text-gray-500 py-8">No billings found</p>
    {:else}
      {#each billings as billing}
        <div class="bg-white rounded-lg p-4 border border-gray-200">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold">{billing.property?.room_name}</h3>
            <span class={`text-xs px-2 py-1 rounded ${{
              'pending': 'bg-yellow-100 text-yellow-800',
              'paid': 'bg-green-100 text-green-800',
              'overdue': 'bg-red-100 text-red-800'
            }[billing.payment_status]}`}>
              {billing.payment_status}
            </span>
          </div>
          <p class="text-gray-600 text-sm mb-3">{billing.id}</p>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600">Amount</span>
            <span class="text-lg font-semibold text-gray-900">
              ${(billing.reading_amount || 0).toFixed(2)}
            </span>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom Nav -->
  <div class="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
    <a href="#/home" class="flex-1 py-3 text-center text-gray-600 font-semibold">🏠 Home</a>
    <a href="#/history" class="flex-1 py-3 text-center text-gray-600 font-semibold">📋 History</a>
    <a href="#/billings" class="flex-1 py-3 text-center text-blue-600 font-semibold">💰 Billings</a>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/Billings.svelte
git commit -m "feat(mobile): add billings screen"
```

---

### Task 20: Mobile — Set up Android build

**Files:**
- Generated by Capacitor: `mobile/android/`

**Context:**  
Initialize the Android project via Capacitor CLI, configure signing (stub for now), and prepare for emulator testing.

- [ ] **Step 1: Build the web app for Capacitor**

```bash
cd mobile && npm run build
```

Expected: `dist/` folder created with `index.html` and bundled assets.

- [ ] **Step 2: Add Android platform**

```bash
npx cap add android
```

Expected: `android/` folder created with Gradle project files.

- [ ] **Step 3: Sync web assets to Android**

```bash
npx cap sync
```

Expected: Assets copied to `android/app/src/main/assets/public/`.

- [ ] **Step 4: Open Android Studio (optional, for testing)**

```bash
npx cap open android
```

This opens Android Studio with the project loaded. You can build and run on an emulator from there.

- [ ] **Step 5: Create build documentation**

Create `mobile/BUILD.md`:
```markdown
# Building the Capacitor Mobile App

## Prerequisites
- Node.js 18+
- Android SDK (API 30+)
- Android Studio (optional, for emulator)

## Development
```bash
npm run dev        # Start dev server (http://localhost:5174)
npm run build      # Build for production
npx cap sync       # Sync web assets to native platforms
npx cap open android  # Open Android Studio
```

## Android Build
1. Open Android Studio via `npx cap open android`
2. Build → Make Project
3. Run → Run 'app'

## Testing
- Use Android emulator or physical device
- Enable USB debugging on physical device
- Connect via `adb devices`
```

- [ ] **Step 6: Commit the build setup**

```bash
git add mobile/android/ mobile/BUILD.md
git commit -m "build(mobile): set up Android platform and build documentation"
```

---

## Verification

After all tasks are complete, run these verification steps:

1. **API role change**: Create an `assistant` user via settings → log in → `POST /readings/batch` should succeed (201)
2. **Settings UI**: Role selector appears on create user form, defaults to "Assistant"
3. **Admin readings**: Photo preview opens on click with pinch/zoom/rotate; Suggest button is removed
4. **Mobile build**: `cd mobile && npm run build && npx cap sync && npx cap open android`
5. **Mobile login**: App launches → Login screen visible → enter credentials → navigates to Home
6. **Mobile capture**: Home → "New Reading Session" → select meter group → select date → take photos → fill readings → submit
7. **Mobile history**: Bottom nav → History → see past readings (if any exist)
8. **Mobile billings**: Bottom nav → Billings → see billing list

---

## Notes

- All reads from Firestore include the soft-delete check (filter `is_deleted = false`)
- Image URLs stay local (data URLs) — no upload to Firebase Storage
- OCR is disabled; `POST /readings/ocr` endpoint exists but returns no suggestions on mobile
- The assistant role can only access: readings (CRUD), properties (GET), meter-groups (GET), billings (GET)
