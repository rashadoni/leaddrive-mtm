package com.mtmobileapp

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.util.Log
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Connection
import okhttp3.ConnectionPool
import okhttp3.EventListener
import okhttp3.OkHttpClient
import okhttp3.Protocol

/**
 * The HTTP client behind every request the app makes.
 *
 * React Native's own client has no timeout of any kind and keeps a connection
 * for reuse without ever asking whether the other end is still there.
 * 7 October 2026, owner's phone: the app had been running for five hours and
 * the phone had gone from mobile data to Wi-Fi. Every request went into a
 * connection nothing came back from — not an answer, not an error — so it was
 * never replaced. The screen said «Server cavab vermir» for over twenty
 * minutes while the same phone reached the same server in half a second from
 * its own shell, and the server logged no request from the app at all. Closing
 * the app and opening it again cured it within a second.
 *
 * What ends such a connection now, without the agent:
 * - a change of the phone's default network closes every connection, because
 *   all of them ride the network that was just left;
 * - the app asks for kept connections to be dropped when it returns to the
 *   screen and when a request got no answer ([reset]);
 * - a socket silent for [SILENCE_TIMEOUT_SECONDS] is given up by the client
 *   itself — the photo upload has no deadline of its own.
 *
 * There is deliberately no periodic ping: the GPS upload wakes the radio about
 * twice a minute already, and a ping between two uploads would wake it twice
 * as often for the whole shift.
 */
object FieldHttp : OkHttpClientFactory {
  private const val TAG = "FieldHttp"

  /** Dialling a server that does not pick up. */
  private const val CONNECT_TIMEOUT_SECONDS = 15L

  /**
   * Longer than any wait the app allows a request of its own (30 s), so this
   * only ends what nothing else ended.
   */
  private const val SILENCE_TIMEOUT_SECONDS = 60L

  /**
   * A request the app has just given up on still holds its connection for a
   * moment. Kept connections are dropped again after it has let go.
   */
  private val SECOND_PASS_DELAYS_MS = longArrayOf(400L, 3_000L)

  private val pool = ConnectionPool()

  /** Every connection a request has used and that may still be open. */
  private val live: MutableSet<Connection> = Collections.newSetFromMap(WeakHashMap<Connection, Boolean>())

  private val worker: ScheduledExecutorService =
    Executors.newSingleThreadScheduledExecutor { task ->
      Thread(task, "FieldHttp").apply { isDaemon = true }
    }

  @Volatile private var appContext: Context? = null
  @Volatile private var defaultNetwork: Network? = null

  /**
   * One client for the whole app: React Native asks this factory more than
   * once, and two clients would each open the same disk cache.
   */
  private val client: OkHttpClient by lazy {
    val context = appContext
    val builder =
      if (context != null) OkHttpClientProvider.createClientBuilder(context)
      else OkHttpClientProvider.createClientBuilder()
    builder
      .connectionPool(pool)
      .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(SILENCE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(SILENCE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .eventListener(Journal)
      .build()
  }

  /** Must run before React Native builds its networking module. */
  fun install(context: Context) {
    appContext = context.applicationContext
    OkHttpClientProvider.setOkHttpClientFactory(this)
    watchDefaultNetwork(context.applicationContext)
  }

  override fun createNewNetworkModuleClient(): OkHttpClient = client

  /**
   * Drop the connections kept for reuse, so the next request dials again.
   * With [includeBusy] the connections still carrying a request are closed
   * too: a GET waiting on one is sent again on a fresh connection by the
   * client itself.
   */
  fun reset(includeBusy: Boolean, reason: String) {
    try {
      worker.execute(Runnable { closeNow(includeBusy, reason) })
      if (!includeBusy) {
        for (delay in SECOND_PASS_DELAYS_MS) {
          worker.schedule(Runnable { pool.evictAll() }, delay, TimeUnit.MILLISECONDS)
        }
      }
    } catch (error: RuntimeException) {
      Log.w(TAG, "connections not dropped ($reason)", error)
    }
  }

  private fun closeNow(includeBusy: Boolean, reason: String) {
    val kept = pool.connectionCount()
    val idle = pool.idleConnectionCount()
    if (includeBusy) {
      val open = synchronized(live) { live.toList() }
      for (connection in open) {
        try {
          connection.socket().close()
        } catch (_: Exception) {
          // Already closed, or closing it failed: either way it is not reused.
        }
      }
    }
    pool.evictAll()
    Log.i(TAG, "connections dropped ($reason): kept=$kept idle=$idle busyToo=$includeBusy")
  }

  private fun watchDefaultNetwork(context: Context) {
    val connectivity =
      context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
    try {
      connectivity.registerDefaultNetworkCallback(
        object : ConnectivityManager.NetworkCallback() {
          override fun onAvailable(network: Network) {
            val previous = defaultNetwork
            defaultNetwork = network
            // The first report is the network the app started on: nothing
            // rides any other network yet.
            if (previous != null && previous != network) {
              reset(includeBusy = true, reason = "default network changed")
            }
          }
        },
      )
    } catch (error: RuntimeException) {
      Log.w(TAG, "default network is not watched", error)
    }
  }

  /**
   * What the connections did, in the device log. On 7 October the release
   * build left nothing to read: whether a request had left the app could only
   * be inferred from the server's log.
   */
  private object Journal : EventListener() {
    override fun connectionAcquired(call: Call, connection: Connection) {
      val fresh = synchronized(live) { live.add(connection) }
      if (!fresh) return
      val local =
        try {
          connection.socket().localAddress?.hostAddress
        } catch (_: Exception) {
          null
        }
      Log.i(
        TAG,
        "connection opened: ${connection.protocol()} to ${connection.route().address.url.host} from $local",
      )
    }

    override fun connectFailed(
      call: Call,
      inetSocketAddress: InetSocketAddress,
      proxy: Proxy,
      protocol: Protocol?,
      ioe: IOException,
    ) {
      Log.w(TAG, "connect failed: ${inetSocketAddress.hostString}: ${ioe.javaClass.simpleName}: ${ioe.message}")
    }

    override fun callFailed(call: Call, ioe: IOException) {
      val request = call.request()
      Log.w(
        TAG,
        "request failed: ${request.method} ${request.url.host}${request.url.encodedPath}: " +
          "${ioe.javaClass.simpleName}: ${ioe.message}",
      )
    }
  }
}
