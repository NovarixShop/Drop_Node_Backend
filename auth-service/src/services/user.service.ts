import { userRepository, UserRepository } from '../repositories/user.repository';
import { IUser, IAddress } from '../models/user.model';
import { NotFoundError, BadRequestError } from '@shared/errors/app-error';
import { UserRole } from '@shared/constants';


const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class UserService {
  private userRepo: UserRepository;

  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  public async getUserProfile(userId: string): Promise<Omit<IUser, 'password'>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  public async updateProfile(userId: string, updateData: { name?: string }): Promise<IUser> {
    const { name } = updateData;
    if (!name) {
      throw new BadRequestError('Name is required');
    }

    const updatedUser = await this.userRepo.update(userId, { name });
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }
    return updatedUser;
  }

  public async addAddress(userId: string, addressData: Partial<IAddress>): Promise<IAddress[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const newAddress: IAddress = {
      street: addressData.street!,
      city: addressData.city!,
      state: addressData.state!,
      postalCode: addressData.postalCode!,
      country: addressData.country!,
      type: addressData.type!,
      isDefault: addressData.isDefault || false,
    };

    if (newAddress.isDefault) {
      user.addresses.forEach((addr) => {
        if (addr.type === newAddress.type) {
          addr.isDefault = false;
        }
      });
    }

    if (user.addresses.length === 0) {
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);
    await user.save();
    return user.addresses;
  }

  public async deleteAddress(userId: string, addressId: string): Promise<IAddress[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const addressIndex = user.addresses.findIndex((addr) => addr.id === addressId);
    if (addressIndex === -1) {
      throw new NotFoundError('Address not found');
    }

    const wasDefault = user.addresses[addressIndex].isDefault;
    const deletedType = user.addresses[addressIndex].type;

    user.addresses.splice(addressIndex, 1);

    if (wasDefault && user.addresses.length > 0) {
      const sameTypeIndex = user.addresses.findIndex((addr) => addr.type === deletedType);
      if (sameTypeIndex !== -1) {
        user.addresses[sameTypeIndex].isDefault = true;
      } else {
        user.addresses[0].isDefault = true;
      }
    }

    await user.save();
    return user.addresses;
  }

  public async getAddresses(userId: string): Promise<IAddress[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user.addresses;
  }

  public async getAllUsers(
    query: { page?: string; limit?: string; search?: string; role?: string }
  ): Promise<{ users: IUser[]; total: number; page: number; pages: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.role) {
      filter.role = query.role;
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: escapeRegex(query.search), $options: 'i' } },
        { email: { $regex: escapeRegex(query.search), $options: 'i' } },
      ];
    }

    const { users, total } = await this.userRepo.findAll(filter, skip, limit);

    return {
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  public async updateUserRole(userId: string, role: UserRole): Promise<IUser> {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestError('Invalid user role');
    }

    const updatedUser = await this.userRepo.update(userId, { role });
    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }

    return updatedUser;
  }
}

export const userService = new UserService();
export default userService;
