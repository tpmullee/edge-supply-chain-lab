from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
except ImportError:  # pragma: no cover - handled at runtime
    pywrapcp = None
    routing_enums_pb2 = None

router = APIRouter()


class VrpRequest(BaseModel):
    distance_matrix: List[List[int]]
    vehicle_count: int = Field(..., gt=0)
    depot_index: int = Field(0, ge=0)


class VrpRoute(BaseModel):
    vehicle: int
    nodes: List[int]
    distance: int


class VrpSolution(BaseModel):
    routes: List[VrpRoute]
    total_distance: int


def _solve_vrp(distance_matrix: List[List[int]], vehicle_count: int, depot_index: int) -> VrpSolution:
    if pywrapcp is None or routing_enums_pb2 is None:
        raise HTTPException(
            status_code=500,
            detail="OR-Tools is not installed. Install with 'pip install ortools' to use the routing lab.",
        )

    if not distance_matrix or any(len(row) != len(distance_matrix) for row in distance_matrix):
        raise HTTPException(status_code=400, detail="Distance matrix must be non-empty and square.")

    n = len(distance_matrix)
    if depot_index < 0 or depot_index >= n:
        raise HTTPException(status_code=400, detail="Depot index must be within matrix bounds.")

    manager = pywrapcp.RoutingIndexManager(n, vehicle_count, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(distance_matrix[from_node][to_node])

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC

    solution = routing.SolveWithParameters(search_params)
    if solution is None:
        raise HTTPException(status_code=500, detail="No feasible routing solution found.")

    routes: List[VrpRoute] = []
    total_distance = 0

    for vehicle_id in range(vehicle_count):
        index = routing.Start(vehicle_id)
        route_nodes: List[int] = []
        route_distance = 0

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route_nodes.append(node)
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)

        # add final depot
        route_nodes.append(manager.IndexToNode(index))
        total_distance += route_distance
        routes.append(VrpRoute(vehicle=vehicle_id, nodes=route_nodes, distance=route_distance))

    return VrpSolution(routes=routes, total_distance=total_distance)


@router.post("/solve", response_model=VrpSolution)
def solve(req: VrpRequest):
    """
    Solve a capacitated VRP-style routing problem using OR-Tools.

    This is a lightweight wrapper around the demo from the OR-CVRP project.
    """
    return _solve_vrp(req.distance_matrix, req.vehicle_count, req.depot_index)


@router.get("/demo", response_model=VrpSolution)
def demo():
    """
    Run the original 6-node / 2-vehicle demo from the or-cvrp repo.
    """
    distance_matrix = [
        [0, 2, 9, 10, 7, 3],
        [2, 0, 6, 4, 3, 8],
        [9, 6, 0, 8, 5, 7],
        [10, 4, 8, 0, 6, 4],
        [7, 3, 5, 6, 0, 3],
        [3, 8, 7, 4, 3, 0],
    ]
    return _solve_vrp(distance_matrix, vehicle_count=2, depot_index=0)
