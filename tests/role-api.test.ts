import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock session BEFORE any imports that load iron-session
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

// requireAdminAuth re-validates the principal against the DB; covered in tests/auth/principal.test.ts
vi.mock("@/lib/auth/principal", () => ({
  loadCurrentPrincipal: vi.fn().mockResolvedValue({
    ok: true,
    principal: { kind: "local", id: "admin-id", username: "admin", role: "admin" },
  }),
}));

// Correct mock path: @/lib/db not @/db
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    query: {
      systemSettings: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  roles: {}, users: {}, userRoles: {}, systemSettings: {},
}));

// Response format from createSuccessResponse: returns data directly (no {success} wrapper)
// createErrorResponse: returns { error: "message" }
describe("Role API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // Helper: create a fresh admin session mock
  async function mockAdminSession() {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValueOnce({
      isLoggedIn: true,
      user: { kind: "local", id: "admin-id", username: "admin", role: "admin", displayName: "Admin" },
      save: vi.fn(), destroy: vi.fn(),
    } as never);
  }

  describe("GET /api/admin/roles", () => {
    it("should return all roles for admin user", async () => {
      await mockAdminSession();

      const mockRoles = [
        { id: "role-1", name: "Admin", description: "Administrator", permissions: ["admin.access"], level: 100, isActive: true },
      ];

      const { db } = await import("@/lib/db");
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockResolvedValueOnce(mockRoles),
      } as never);

      const { GET } = await import("@/app/api/admin/roles/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.roles).toBeDefined();
      expect(data.roles).toEqual(mockRoles);
    });

    it("should return 403 for non-admin user", async () => {
      const { getSession } = await import("@/lib/session");
      vi.mocked(getSession).mockResolvedValueOnce({
        isLoggedIn: true,
        user: { id: "user-id", role: "user" },
        save: vi.fn(), destroy: vi.fn(),
      } as never);

      const { GET } = await import("@/app/api/admin/roles/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBeDefined();
    });

    it("should return 401 for unauthenticated user", async () => {
      const { getSession } = await import("@/lib/session");
      vi.mocked(getSession).mockResolvedValueOnce({
        isLoggedIn: false, save: vi.fn(), destroy: vi.fn(),
      } as never);

      const { GET } = await import("@/app/api/admin/roles/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });
  });

  describe("POST /api/admin/roles", () => {
    it("should create a new role with valid data", async () => {
      await mockAdminSession();

      const newRole = { name: "Test Role", description: "desc", permissions: ["users:read"], level: 10 };
      const mockCreatedRole = { id: "new-id", ...newRole, isActive: true, createdAt: new Date(), updatedAt: new Date() };

      const { db } = await import("@/lib/db");
      // Check for existing role name → not found
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      } as never);
      // Insert returning
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([mockCreatedRole]),
        }),
      } as never);

      const { POST } = await import("@/app/api/admin/roles/route");
      const request = new Request("http://localhost:3000/api/admin/roles", {
        method: "POST",
        body: JSON.stringify(newRole),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.role.id).toBe(mockCreatedRole.id);
      expect(data.role.name).toBe(mockCreatedRole.name);
      expect(data.role.level).toBe(mockCreatedRole.level);
      expect(data.role.isActive).toBe(mockCreatedRole.isActive);
    });

    it("should return 400 for missing role name", async () => {
      await mockAdminSession();

      const { POST } = await import("@/app/api/admin/roles/route");
      const request = new Request("http://localhost:3000/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ description: "no name", level: 10, permissions: [] }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Role name is required");
    });

    it("should return 400 for invalid permissions type", async () => {
      await mockAdminSession();

      const { POST } = await import("@/app/api/admin/roles/route");
      const request = new Request("http://localhost:3000/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ name: "Test", level: 10, permissions: "not-array" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Permissions must be an array");
    });
  });

  describe("PUT /api/admin/roles/[id]", () => {
    it("should update role with valid data", async () => {
      await mockAdminSession();

      const roleId = "test-role-id";
      const updateData = { name: "Updated Role", level: 20 };
      const existingRole = { id: roleId, name: "Original", description: "desc", permissions: [], level: 10, isActive: true };
      const updatedRole = { ...existingRole, ...updateData, updatedAt: new Date() };

      const { db } = await import("@/lib/db");
      // SELECT to check role exists
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([existingRole]),
          }),
        }),
      } as never);
      // SELECT to check name conflict (name is changing)
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]), // no conflict
          }),
        }),
      } as never);
      // UPDATE returning
      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce([updatedRole]),
          }),
        }),
      } as never);

      const { PUT } = await import("@/app/api/admin/roles/[id]/route");
      const request = new Request(`http://localhost:3000/api/admin/roles/${roleId}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PUT(request as never, { params: Promise.resolve({ id: roleId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.role).toBeDefined();
      expect(data.role.name).toBe("Updated Role");
    });

    it("should return 404 for non-existent role", async () => {
      await mockAdminSession();

      const { db } = await import("@/lib/db");
      // SELECT → role not found
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      } as never);

      const { PUT } = await import("@/app/api/admin/roles/[id]/route");
      const request = new Request("http://localhost:3000/api/admin/roles/non-existent", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Name" }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await PUT(request as never, { params: Promise.resolve({ id: "non-existent" }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Role not found");
    });
  });

  describe("DELETE /api/admin/roles/[id]", () => {
    it("should delete a non-system role", async () => {
      await mockAdminSession();

      const roleId = "test-role-id";
      const { db } = await import("@/lib/db");

      // SELECT to check role exists (not a system role)
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ id: roleId, name: "Test Role", level: 10 }]),
          }),
        }),
      } as never);
      // DELETE
      vi.mocked(db.delete).mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce(undefined),
      } as never);

      const { DELETE } = await import("@/app/api/admin/roles/[id]/route");
      const request = new Request(`http://localhost:3000/api/admin/roles/${roleId}`, { method: "DELETE" });

      const response = await DELETE(request as never, { params: Promise.resolve({ id: roleId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Role deleted successfully");
    });

    it("should not allow deleting system roles", async () => {
      await mockAdminSession();

      const { db } = await import("@/lib/db");
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ id: "admin-role-id", name: "admin", level: 100 }]),
          }),
        }),
      } as never);

      const { DELETE } = await import("@/app/api/admin/roles/[id]/route");
      const request = new Request("http://localhost:3000/api/admin/roles/admin-role-id", { method: "DELETE" });

      const response = await DELETE(request as never, { params: Promise.resolve({ id: "admin-role-id" }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Cannot delete system roles");
    });
  });
});
