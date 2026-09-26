import { HttpClient } from "../api/HttpClient";
import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { ApiUserRepository } from "../repositories/ApiUserRepository";
import { ApiAuthRepository } from "../repositories/ApiAuthRepository";
import { ICustomerRepository } from "../../domain/repositories/ICustomerRepository";
import { ApiCustomerRepository } from "../repositories/ApiCustomerRepository";
import { IAuthService } from "../../domain/services/IAuthService";
import { IAuthRepository } from "../../domain/repositories/IAuthRepository";
import { AuthService } from "../../application/services/AuthService";
import { ICashierRepository } from "../../domain/repositories/ICashierRepository";
import { ICashierService } from "../../domain/services/ICashierService";
import { UserManagementService } from "../../application/services/UserManagementService";
import { CustomerManagementService } from "../../application/services/CustomerManagementService";
import { ICustomerService } from "../../domain/services/ICustomerService";
import { IUserService } from "../../domain/services/IUserService";
import { CashierService } from "../../application/services/CashierService";
import { ApiCashierRepository } from "../repositories/ApiCashierRepository";
import { IPosSyncRepository } from "../../domain/repositories/IPosSyncRepository";
import { ApiPosSyncRepository } from "../repositories/ApiPosSyncRepository";
import { IPosSyncService } from "../../domain/services/IPosSyncService";
import { PosSyncService } from "../../application/services/PosSyncService";
import { ISalesOrderRepository } from "../../domain/repositories/ISalesOrderRepository";
import { ApiSalesOrderRepository } from "../repositories/ApiSalesOrderRepository";
import { ISalesOrderService } from "../../domain/services/ISalesOrderService";
import { SalesOrderService } from "../../application/services/SalesOrderService";
import { IMembershipCardRepository } from "../../domain/repositories/IMembershipCardRepository";
import { ApiMembershipCardRepository } from "../repositories/ApiMembershipCardRepository";
import { IMembershipCardService } from "../../domain/services/IMembershipCardService";
import { MembershipCardService } from "../../application/services/MembershipCardService";
import { IGuestWalletRepository } from "../../domain/repositories/IGuestWalletRepository";
import { ApiGuestWalletRepository } from "../repositories/ApiGuestWalletRepository";
import { IGuestWalletService } from "../../domain/services/IGuestWalletService";
import { GuestWalletService } from "../../application/services/GuestWalletService";
import { IKitchenPrinterRepository } from "../../domain/repositories/IKitchenPrinterRepository";
import { ApiKitchenPrinterRepository } from "../repositories/ApiKitchenPrinterRepository";
import { IKitchenPrinterService } from "../../domain/services/IKitchenPrinterService";
import { KitchenPrinterService } from "../../application/services/KitchenPrinterService";
import { IPrintTemplateRepository } from "../../domain/repositories/IPrintTemplateRepository";
import { ApiPrintTemplateRepository } from "../repositories/ApiPrintTemplateRepository";
import { IPrintTemplateService } from "../../domain/services/IPrintTemplateService";
import { PrintTemplateService } from "../../application/services/PrintTemplateService";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { ApiCategoryRepository } from "../repositories/ApiCategoryRepository";
import { ICategoryService } from "../../domain/services/ICategoryService";
import { CategoryService } from "../../application/services/CategoryService";
import { IKdsStationRepository } from "../../domain/repositories/IKdsStationRepository";
import { ApiKdsStationRepository } from "../repositories/ApiKdsStationRepository";
import { IKdsStationService } from "../../domain/services/IKdsStationService";
import { KdsStationService } from "../../application/services/KdsStationService";
import { IReportRepository } from "../../domain/repositories/IReportRepository";
import { ApiReportRepository } from "../repositories/ApiReportRepository";
import { IReportService } from "../../domain/services/IReportService";
import { ReportService } from "../../application/services/ReportService";
import { IKtvRepository } from "../../domain/repositories/IKtvRepository";
import { ApiKtvRepository } from "../repositories/ApiKtvRepository";
import { IKtvService } from "../../domain/services/IKtvService";
import { KtvService } from "../../application/services/KtvService";
import { ISpaRepository } from "../../domain/repositories/ISpaRepository";
import { ApiSpaRepository } from "../repositories/ApiSpaRepository";
import { ISpaService } from "../../domain/services/ISpaService";
import { SpaService } from "../../application/services/SpaService";
import { IRoomTabletRepository } from "../../domain/repositories/IRoomTabletRepository";
import { ApiRoomTabletRepository } from "../repositories/ApiRoomTabletRepository";
import { IRoomTabletService } from "../../domain/services/IRoomTabletService";
import { RoomTabletService } from "../../application/services/RoomTabletService";

/**
 * Dependency Injection Container
 * Registers concrete infrastructure/application implementations once.
 */
class Container {
  private instances: Map<string, unknown> = new Map();

  constructor() {
    this.initializeContainer();
  }

  private initializeContainer(): void {
    this.register("httpClient", new HttpClient());

    this.register<IUserRepository>(
      "userRepository",
      new ApiUserRepository(this.resolve("httpClient"))
    );

    this.register<IAuthRepository>(
      "authRepository",
      new ApiAuthRepository(this.resolve("httpClient"))
    );

    this.register<ICustomerRepository>(
      "customerRepository",
      new ApiCustomerRepository(this.resolve("httpClient"))
    );
    this.register<IMembershipCardRepository>(
      "membershipCardRepository",
      new ApiMembershipCardRepository(this.resolve("httpClient"))
    );
    this.register<IGuestWalletRepository>(
      "guestWalletRepository",
      new ApiGuestWalletRepository(this.resolve("httpClient"))
    );
    this.register<ICashierRepository>(
      "cashierRepository",
      new ApiCashierRepository(this.resolve("httpClient"))
    );
    this.register<IPosSyncRepository>(
      "posSyncRepository",
      new ApiPosSyncRepository(this.resolve("httpClient"))
    );
    this.register<ISalesOrderRepository>(
      "salesOrderRepository",
      new ApiSalesOrderRepository(this.resolve("httpClient"))
    );
    this.register<IKitchenPrinterRepository>(
      "kitchenPrinterRepository",
      new ApiKitchenPrinterRepository(this.resolve("httpClient"))
    );
    this.register<IPrintTemplateRepository>(
      "printTemplateRepository",
      new ApiPrintTemplateRepository(this.resolve("httpClient"))
    );
    this.register<ICategoryRepository>(
      "categoryRepository",
      new ApiCategoryRepository(this.resolve("httpClient"))
    );
    this.register<IKdsStationRepository>(
      "kdsStationRepository",
      new ApiKdsStationRepository(this.resolve("httpClient"))
    );
    this.register<IReportRepository>(
      "reportRepository",
      new ApiReportRepository(this.resolve("httpClient"))
    );
    this.register<IKtvRepository>(
      "ktvRepository",
      new ApiKtvRepository(this.resolve("httpClient"))
    );
    this.register<ISpaRepository>(
      "spaRepository",
      new ApiSpaRepository(this.resolve("httpClient"))
    );
    this.register<IRoomTabletRepository>(
      "roomTabletRepository",
      new ApiRoomTabletRepository(this.resolve("httpClient"))
    );

    this.register<IAuthService>(
      "authService",
      new AuthService(this.resolve("authRepository"))
    );

    this.register<IUserService>(
      "userService",
      new UserManagementService(this.resolve("userRepository"))
    );

    this.register<ICustomerService>(
      "customerService",
      new CustomerManagementService(this.resolve("customerRepository"))
    );
    this.register<IMembershipCardService>(
      "membershipCardService",
      new MembershipCardService(this.resolve("membershipCardRepository"))
    );
    this.register<IGuestWalletService>(
      "guestWalletService",
      new GuestWalletService(this.resolve("guestWalletRepository"))
    );
    this.register<ICashierService>(
      "cashierService",
      new CashierService(this.resolve("cashierRepository"))
    );
    this.register<IPosSyncService>(
      "posSyncService",
      new PosSyncService(this.resolve("posSyncRepository"))
    );
    this.register<ISalesOrderService>(
      "salesOrderService",
      new SalesOrderService(this.resolve("salesOrderRepository"))
    );
    this.register<IKitchenPrinterService>(
      "kitchenPrinterService",
      new KitchenPrinterService(this.resolve("kitchenPrinterRepository"))
    );
    this.register<IPrintTemplateService>(
      "printTemplateService",
      new PrintTemplateService(this.resolve("printTemplateRepository"))
    );
    this.register<ICategoryService>(
      "categoryService",
      new CategoryService(this.resolve("categoryRepository"))
    );
    this.register<IKdsStationService>(
      "kdsStationService",
      new KdsStationService(this.resolve("kdsStationRepository"))
    );
    this.register<IReportService>(
      "reportService",
      new ReportService(this.resolve("reportRepository"))
    );
    this.register<IKtvService>(
      "ktvService",
      new KtvService(this.resolve("ktvRepository"))
    );
    this.register<ISpaService>(
      "spaService",
      new SpaService(this.resolve("spaRepository"))
    );
    this.register<IRoomTabletService>(
      "roomTabletService",
      new RoomTabletService(this.resolve("roomTabletRepository"))
    );
  }

  register<T>(key: string, instance: T): void {
    this.instances.set(key, instance);
  }

  resolve<T>(key: string): T {
    const instance = this.instances.get(key);
    if (!instance) {
      throw new Error(`No instance registered for key: ${key}`);
    }
    return instance as T;
  }
}

const container = new Container();

export default container;
