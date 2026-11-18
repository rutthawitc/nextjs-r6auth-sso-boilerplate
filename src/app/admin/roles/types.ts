export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  level: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleData {
  name: string;
  description: string;
  permissions: string[];
  level: number;
}

export interface UpdateRoleData extends Partial<CreateRoleData> {
  isActive?: boolean;
}