package uk.splinteredapex.healthmonitor

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Read-only bridge to Health Connect. Samsung Health shares Galaxy Watch data
 * into Health Connect; the web app maps and stores it locally (src/native).
 * Nothing is written to Health Connect and nothing leaves the device.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val permissionsByType: Map<String, String> = mapOf(
        "BloodPressure" to HealthPermission.getReadPermission(BloodPressureRecord::class),
        "Weight" to HealthPermission.getReadPermission(WeightRecord::class),
        "SleepSession" to HealthPermission.getReadPermission(SleepSessionRecord::class),
        "ExerciseSession" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        "RestingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        "Steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "HeartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
    )

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            HealthConnectClient.SDK_UNAVAILABLE -> "not_installed"
            else -> "unsupported"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun getGrantedPermissions(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(JSObject().put("granted", grantedTypes()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read permissions", e)
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        val types = call.getArray("types")?.toList<String>() ?: permissionsByType.keys.toList()
        val perms = types.mapNotNull { permissionsByType[it] }.toSet()
        if (perms.isEmpty()) {
            call.reject("No valid data types requested")
            return
        }
        val contract = PermissionController.createRequestPermissionResultContract()
        val intent: Intent = contract.createIntent(context, perms)
        startActivityForResult(call, intent, "onPermissionsResult")
    }

    @ActivityCallback
    private fun onPermissionsResult(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        if (call == null) return
        // Re-query rather than trusting the result intent: covers partial grants.
        scope.launch {
            try {
                call.resolve(JSObject().put("granted", grantedTypes()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read permissions", e)
            }
        }
    }

    @PluginMethod
    fun openHealthConnectSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Health Connect settings unavailable", e)
        }
    }

    @PluginMethod
    fun readRecords(call: PluginCall) {
        val type = call.getString("type")
        val start: Instant
        val end: Instant
        try {
            start = Instant.parse(call.getString("startTime"))
            end = Instant.parse(call.getString("endTime"))
        } catch (e: Exception) {
            call.reject("Invalid time range", e)
            return
        }
        if (!end.isAfter(start)) {
            call.reject("End must be after start")
            return
        }
        scope.launch {
            try {
                val arr = when (type) {
                    "BloodPressure" -> readBloodPressure(start, end)
                    "Weight" -> readWeight(start, end)
                    "SleepSession" -> readSleep(start, end)
                    "ExerciseSession" -> readExercise(start, end)
                    "RestingHeartRate" -> readRestingHr(start, end)
                    "Steps" -> readSteps(start, end)
                    else -> {
                        call.reject("Unsupported type: $type")
                        return@launch
                    }
                }
                call.resolve(JSObject().put("records", arr))
            } catch (e: SecurityException) {
                call.reject("Permission not granted for $type", "PERMISSION_DENIED", e)
            } catch (e: Exception) {
                call.reject(e.message ?: "Read failed", e)
            }
        }
    }

    private suspend fun grantedTypes(): JSArray {
        val granted = client().permissionController.getGrantedPermissions()
        val out = JSArray()
        permissionsByType.filterValues { it in granted }.keys.forEach { out.put(it) }
        return out
    }

    private suspend fun <T : Record> readAll(cls: KClass<T>, start: Instant, end: Instant): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val resp = client().readRecords(
                ReadRecordsRequest(
                    recordType = cls,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    pageSize = 1000,
                    pageToken = token,
                )
            )
            out += resp.records
            token = resp.pageToken
        } while (token != null)
        return out
    }

    private fun JSObject.putOpt(key: String, value: Any?): JSObject {
        if (value != null) put(key, value)
        return this
    }

    private suspend fun readBloodPressure(start: Instant, end: Instant): JSArray {
        val arr = JSArray()
        readAll(BloodPressureRecord::class, start, end).forEach { r ->
            arr.put(
                JSObject()
                    .put("id", r.metadata.id)
                    .put("time", r.time.toString())
                    .putOpt("zoneOffsetSeconds", r.zoneOffset?.totalSeconds)
                    .put("systolic", r.systolic.inMillimetersOfMercury)
                    .put("diastolic", r.diastolic.inMillimetersOfMercury)
                    .put("origin", r.metadata.dataOrigin.packageName)
            )
        }
        return arr
    }

    private suspend fun readWeight(start: Instant, end: Instant): JSArray {
        val arr = JSArray()
        readAll(WeightRecord::class, start, end).forEach { r ->
            arr.put(
                JSObject()
                    .put("id", r.metadata.id)
                    .put("time", r.time.toString())
                    .putOpt("zoneOffsetSeconds", r.zoneOffset?.totalSeconds)
                    .put("kg", r.weight.inKilograms)
                    .put("origin", r.metadata.dataOrigin.packageName)
            )
        }
        return arr
    }

    private fun stageMinutes(r: SleepSessionRecord, stage: Int): Long =
        r.stages.filter { it.stage == stage }.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }

    private suspend fun readSleep(start: Instant, end: Instant): JSArray {
        val arr = JSArray()
        readAll(SleepSessionRecord::class, start, end).forEach { r ->
            val o = JSObject()
                .put("id", r.metadata.id)
                .put("startTime", r.startTime.toString())
                .put("endTime", r.endTime.toString())
                .putOpt("startZoneOffsetSeconds", r.startZoneOffset?.totalSeconds)
                .putOpt("endZoneOffsetSeconds", r.endZoneOffset?.totalSeconds)
                .put("origin", r.metadata.dataOrigin.packageName)
            if (r.stages.isNotEmpty()) {
                o.put("deepMin", stageMinutes(r, SleepSessionRecord.STAGE_TYPE_DEEP))
                o.put("remMin", stageMinutes(r, SleepSessionRecord.STAGE_TYPE_REM))
                o.put("lightMin", stageMinutes(r, SleepSessionRecord.STAGE_TYPE_LIGHT))
                o.put("awakeMin", stageMinutes(r, SleepSessionRecord.STAGE_TYPE_AWAKE))
            }
            arr.put(o)
        }
        return arr
    }

    private fun exerciseCategory(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "strength"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA,
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES,
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "mobility"
        else -> "other"
    }

    private suspend fun readExercise(start: Instant, end: Instant): JSArray {
        val arr = JSArray()
        val granted = client().permissionController.getGrantedPermissions()
        val canHr = permissionsByType["HeartRate"] in granted
        val canDistance = HealthPermission.getReadPermission(DistanceRecord::class) in granted
        readAll(ExerciseSessionRecord::class, start, end).forEach { r ->
            val range = TimeRangeFilter.between(r.startTime, r.endTime)
            val avgHr: Long? = if (canHr) {
                try { client().aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), range))[HeartRateRecord.BPM_AVG] } catch (_: Exception) { null }
            } else null
            val distanceM: Double? = if (canDistance) {
                try { client().aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), range))[DistanceRecord.DISTANCE_TOTAL]?.inMeters } catch (_: Exception) { null }
            } else null
            arr.put(
                JSObject()
                    .put("id", r.metadata.id)
                    .put("startTime", r.startTime.toString())
                    .put("endTime", r.endTime.toString())
                    .putOpt("startZoneOffsetSeconds", r.startZoneOffset?.totalSeconds)
                    .put("category", exerciseCategory(r.exerciseType))
                    .putOpt("title", r.title)
                    .putOpt("avgHr", avgHr)
                    .putOpt("distanceM", distanceM)
                    .put("origin", r.metadata.dataOrigin.packageName)
            )
        }
        return arr
    }

    private suspend fun readRestingHr(start: Instant, end: Instant): JSArray {
        val arr = JSArray()
        readAll(RestingHeartRateRecord::class, start, end).forEach { r ->
            arr.put(
                JSObject()
                    .put("id", r.metadata.id)
                    .put("time", r.time.toString())
                    .putOpt("zoneOffsetSeconds", r.zoneOffset?.totalSeconds)
                    .put("bpm", r.beatsPerMinute)
            )
        }
        return arr
    }

    /** Daily step totals, de-duplicated across sources by Health Connect's aggregation. */
    private suspend fun readSteps(start: Instant, end: Instant): JSArray {
        val zone = ZoneId.systemDefault()
        val from: LocalDateTime = LocalDateTime.ofInstant(start, zone).toLocalDate().atStartOfDay()
        val to: LocalDateTime = LocalDateTime.ofInstant(end, zone)
        val buckets = client().aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(from, to),
                timeRangeSlicer = Period.ofDays(1),
            )
        )
        val arr = JSArray()
        buckets.forEach { b ->
            val steps = b.result[StepsRecord.COUNT_TOTAL] ?: return@forEach
            arr.put(JSObject().put("date", b.startTime.toLocalDate().toString()).put("steps", steps))
        }
        return arr
    }

    companion object {
        private const val PROVIDER = "com.google.android.apps.healthdata"
    }
}
