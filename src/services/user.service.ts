import { userRepository, UserRepository } from '../repositories/user.repository';
import { IUser, IAddress } from '../models/user.model';
import { NotFoundError, BadRequestError } from '../errors/app-error';
import { UserRole, AddressType } from '../constants';

export class UserService {
  private userRepo: UserRepository;

  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  // Get user profile
  public async getUserProfile(userId: string): Promise<Omit<IUser, 'password'>> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  // Update profile basic info
  public async updateProfile(
    userId: string,
    updateData: {
      name?: string;
      phone?: string;
      address?: {
        street: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    }
  ): Promise<IUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (updateData.name) {
      user.name = updateData.name;
    }
    if (updateData.phone !== undefined) {
      user.phone = updateData.phone;
    }

    if (updateData.address) {
      const { street, city, state, postalCode, country } = updateData.address;
      if (user.addresses && user.addresses.length > 0) {
        user.addresses[0].street = street;
        user.addresses[0].city = city;
        user.addresses[0].state = state;
        user.addresses[0].postalCode = postalCode;
        user.addresses[0].country = country;
      } else {
        user.addresses = [
          {
            street,
            city,
            state,
            postalCode,
            country,
            type: AddressType.SHIPPING,
            isDefault: true,
          } as any,
        ];
      }
    }

    await user.save();
    return user;
  }

  // Add address to user profile
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

    // If it is set as default, unset other addresses of same type
    if (newAddress.isDefault) {
      user.addresses.forEach((addr) => {
        if (addr.type === newAddress.type) {
          addr.isDefault = false;
        }
      });
    }

    // If it's the first address, make it default automatically
    if (user.addresses.length === 0) {
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);
    await user.save();
    return user.addresses;
  }

  // Delete address
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

    // Remove the address
    user.addresses.splice(addressIndex, 1);

    // If we deleted the default address and there are remaining addresses, set the first one of same type as default
    if (wasDefault && user.addresses.length > 0) {
      const sameTypeIndex = user.addresses.findIndex((addr) => addr.type === deletedType);
      if (sameTypeIndex !== -1) {
        user.addresses[sameTypeIndex].isDefault = true;
      } else {
        // Fallback to first address if none of same type
        user.addresses[0].isDefault = true;
      }
    }

    await user.save();
    return user.addresses;
  }

  // Get addresses
  public async getAddresses(userId: string): Promise<IAddress[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user.addresses;
  }

  // Admin: Get all users with pagination and search filtering
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
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
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

  // Admin: Update user role
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
