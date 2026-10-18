import {
  CompleteDailyTaskDto,
  GenerateDailyTasksDto,
  QueryDailyTasksDto,
} from '../daily-tasks/dto/daily-task.dto';
import {
  CreateIncidentDto,
  QueryIncidentsDto,
  ReviewIncidentDto,
} from '../incidents/dto/incident.dto';
import {
  AdjustStockDto,
  CreateRestockRequestDto,
  DeliverRestockRequestDto,
  QueryInventoryDto,
  QueryRestockRequestsDto,
  ReviewRestockRequestDto,
} from '../inventory/dto/inventory.dto';
import {
  CreateNutritionPlanDto,
  MealDto,
  MealItemDto,
  QueryNutritionPlanDto,
  ReviewNutritionPlanDto,
  UpdateNutritionPlanDto,
} from '../nutrition/dto/nutrition-plan.dto';
import {
  AssignShiftRosterDto,
  CopyWeekRosterDto,
  QueryShiftRosterDto,
} from '../shift-rosters/dto/shift-roster.dto';
import {
  CreateShiftCatalogDto,
  QueryShiftCatalogDto,
  SetShiftStatusDto,
  UpdateShiftCatalogDto,
} from '../shifts/dto/shift.dto';
import {
  CreateSupplyCatalogDto,
  QuerySupplyCatalogDto,
  SetSupplyStatusDto,
  UpdateSupplyCatalogDto,
} from '../supplies/dto/supply.dto';
import {
  IncidentStatus,
  NutritionPlanStatus,
  RestockStatus,
  SeverityLevel,
  SupplyCategory,
  SupplyUnit,
} from '@prisma/client';

describe('Stable and Inventory DTOs', () => {
  it('instantiates Daily Tasks DTOs correctly', () => {
    const q = new QueryDailyTasksDto();
    q.date = '2026-10-18';
    q.zoneId = 'zone-1';
    q.onlyMyTasks = true;
    expect(q.date).toBe('2026-10-18');

    const g = new GenerateDailyTasksDto();
    g.date = '2026-10-18';
    g.zoneId = 'zone-1';
    expect(g.zoneId).toBe('zone-1');

    const c = new CompleteDailyTaskDto();
    c.notes = 'Clean';
    expect(c.notes).toBe('Clean');
  });

  it('instantiates Incidents DTOs correctly', () => {
    const create = new CreateIncidentDto();
    create.horseId = 'h1';
    create.severity = SeverityLevel.CRITICAL;
    create.symptoms = ['FEVER'];
    create.symptomsJson = ['FEVER'];
    create.description = 'Colic signs';
    expect(create.severity).toBe(SeverityLevel.CRITICAL);

    const query = new QueryIncidentsDto();
    query.status = IncidentStatus.REPORTED;
    query.severity = SeverityLevel.CRITICAL;
    query.limit = 10;
    query.page = 1;
    query.horseId = 'h1';
    query.zoneId = 'z1';
    query.startDate = '2026-10-01';
    query.endDate = '2026-10-18';
    expect(query.limit).toBe(10);

    const review = new ReviewIncidentDto();
    review.status = IncidentStatus.RESOLVED;
    review.vetNotes = 'Administered meds';
    expect(review.status).toBe(IncidentStatus.RESOLVED);
  });

  it('instantiates Inventory DTOs correctly', () => {
    const qInv = new QueryInventoryDto();
    qInv.category = SupplyCategory.FEED_HAY;
    qInv.lowStockOnly = true;
    qInv.search = 'hay';
    qInv.zoneId = 'z1';
    expect(qInv.lowStockOnly).toBe(true);

    const adj = new AdjustStockDto();
    adj.zoneId = 'z1';
    adj.supplyId = 's1';
    adj.actualQuantity = 20;
    adj.minThreshold = 10;
    adj.reason = 'Audit';
    expect(adj.actualQuantity).toBe(20);

    const qReq = new QueryRestockRequestsDto();
    qReq.status = RestockStatus.PENDING;
    expect(qReq.status).toBe(RestockStatus.PENDING);

    const cReq = new CreateRestockRequestDto();
    cReq.requestedQuantity = 50;
    cReq.urgencyReason = 'Running out';
    expect(cReq.requestedQuantity).toBe(50);

    const rReq = new ReviewRestockRequestDto();
    rReq.action = 'APPROVE';
    rReq.approvedQuantity = 40;
    expect(rReq.approvedQuantity).toBe(40);

    const dReq = new DeliverRestockRequestDto();
    dReq.receivedQuantity = 40;
    dReq.deliveryNotes = 'Shelf A';
    expect(dReq.receivedQuantity).toBe(40);
  });

  it('instantiates Nutrition DTOs correctly', () => {
    const item = new MealItemDto();
    item.supplyId = 's1';
    item.supplyName = 'Hay';
    item.category = 'FEED_HAY';
    item.amount = 5;
    item.unit = 'KG';
    item.notes = 'Fresh';
    expect(item.amount).toBe(5);

    const meal = new MealDto();
    meal.mealType = 'MORNING';
    meal.time = '06:00';
    meal.items = [item];
    expect(meal.items.length).toBe(1);

    const plan = new CreateNutritionPlanDto();
    plan.horseId = 'h1';
    plan.meals = [meal];
    plan.specialInstructions = 'No sugar';
    plan.submitImmediately = true;
    expect(plan.submitImmediately).toBe(true);

    const upd = new UpdateNutritionPlanDto();
    upd.specialInstructions = 'Extra water';
    expect(upd.specialInstructions).toBe('Extra water');

    const rev = new ReviewNutritionPlanDto();
    rev.action = 'APPROVE';
    rev.vetNotes = 'Good';
    expect(rev.action).toBe('APPROVE');

    const qPlan = new QueryNutritionPlanDto();
    qPlan.status = NutritionPlanStatus.APPROVED;
    expect(qPlan.status).toBe(NutritionPlanStatus.APPROVED);
  });

  it('instantiates Shift and Shift Roster DTOs correctly', () => {
    const assign = new AssignShiftRosterDto();
    assign.shiftId = 'sh1';
    assign.groomUserIds = ['g1'];
    assign.zoneId = 'z1';
    assign.date = '2026-10-18';
    expect(assign.date).toBe('2026-10-18');

    const copy = new CopyWeekRosterDto();
    copy.sourceWeekStart = '2026-10-12';
    copy.targetWeekStart = '2026-10-19';
    copy.overwrite = true;
    expect(copy.overwrite).toBe(true);

    const qRoster = new QueryShiftRosterDto();
    qRoster.startDate = '2026-10-12';
    expect(qRoster.startDate).toBe('2026-10-12');

    const cShift = new CreateShiftCatalogDto();
    cShift.code = 'MS-1';
    cShift.name = 'Morning';
    cShift.startTime = '06:00';
    cShift.endTime = '14:00';
    expect(cShift.code).toBe('MS-1');

    const uShift = new UpdateShiftCatalogDto();
    uShift.name = 'Morning Shift';
    expect(uShift.name).toBe('Morning Shift');

    const sShift = new SetShiftStatusDto();
    sShift.isActive = false;
    expect(sShift.isActive).toBe(false);

    const qShift = new QueryShiftCatalogDto();
    qShift.status = 'ACTIVE';
    expect(qShift.status).toBe('ACTIVE');
  });

  it('instantiates Supplies DTOs correctly', () => {
    const cSup = new CreateSupplyCatalogDto();
    cSup.code = 'SUP-1';
    cSup.name = 'Hay';
    cSup.category = SupplyCategory.FEED_HAY;
    cSup.unit = SupplyUnit.KG;
    cSup.unitPrice = 50000;
    expect(cSup.unitPrice).toBe(50000);

    const uSup = new UpdateSupplyCatalogDto();
    uSup.name = 'Hay High Quality';
    expect(uSup.name).toBe('Hay High Quality');

    const sSup = new SetSupplyStatusDto();
    sSup.isActive = false;
    expect(sSup.isActive).toBe(false);

    const qSup = new QuerySupplyCatalogDto();
    qSup.category = SupplyCategory.FEED_HAY;
    expect(qSup.category).toBe(SupplyCategory.FEED_HAY);
  });
});
