'use strict'

import React, { Component } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { connect } from 'react-redux'
import TouchID from 'react-native-touch-id'
import { fbt } from 'fbt-runtime'

import CommonStyles from 'styles/common'
import PinInput from 'components/pin-input'
import OriginButton from 'components/origin-button'

const IMAGES_PATH = '../../assets/images/'

class AuthenticationGuard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      pin: '',
      error: null
    }
    if (!this.props.settings.biometryType && !this.props.settings.pin) {
      // User has no authentication method set, proceed
      this.onSuccess()
    }

    this.handleChange = this.handleChange.bind(this)
  }

  componentDidMount() {
    if (this.props.settings.biometryType) {
      this.touchAuthenticate()
    }
  }

  touchAuthenticate() {
    TouchID.authenticate('Access Origin Marketplace App')
      .then(() => {
        this.onSuccess()
      })
      .catch(() => {
        this.setState({
          error: String(
            fbt(
              'Authentication failed',
              'AuthenticationGuard.biometryFailedError'
            )
          )
        })
      })
  }

  onSuccess() {
    const onSuccess = this.props.navigation.getParam('navigateOnSuccess')
    if (onSuccess) {
      this.props.navigation.navigate(onSuccess)
    }
  }

  async handleChange(pin) {
    await this.setState({ pin })
    if (this.state.pin === this.props.settings.pin) {
      this.onSuccess()
    } else if (this.state.pin.length === this.props.settings.pin.length) {
      this.setState({
        error: String(
          fbt('Incorrect pin code', 'AuthenticationGuard.incorrectPinError')
        ),
        pin: ''
      })
    } else {
      this.setState({
        error: null
      })
    }
  }

  render() {
    const { settings } = this.props

    const guard = settings.biometryType
      ? this.renderBiometryGuard()
      : settings.pin
      ? this.renderPinGuard()
      : null

    return (
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <View style={styles.container}>
            <Image
              resizeMethod={'scale'}
              resizeMode={'contain'}
              source={require(IMAGES_PATH + 'lock-icon.png')}
              style={styles.image}
            />
            {guard}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  renderBiometryGuard() {
    return (
      <>
        <Text style={styles.title}>
          <fbt desc="AuthenticationGuard.biometryTitle">
            Authentication required
          </fbt>
        </Text>
        {this.state.error && (
          <>
            <Text style={styles.invalid}>{this.state.error}</Text>
            <OriginButton
              size="large"
              type="primary"
              style={{ marginTop: 40 }}
              title={fbt('Retry', 'AuthenticationGuard.retryButton')}
              onPress={() => {
                this.touchAuthenticate()
              }}
            />
          </>
        )}
      </>
    )
  }

  renderPinGuard() {
    const { settings } = this.props
    return (
      <>
        <Text style={styles.title}>
          <fbt desc="AuthenticationGuard.pinTitle">Pin required</fbt>
        </Text>
        {this.state.error && (
          <Text style={styles.invalid}>{this.state.error}</Text>
        )}
        <PinInput
          value={this.state.pin}
          pinLength={settings.pin.length}
          onChangeText={this.handleChange}
        />
      </>
    )
  }
}

const mapStateToProps = ({ settings }) => {
  return { settings }
}

export default connect(mapStateToProps)(AuthenticationGuard)

const styles = StyleSheet.create({
  ...CommonStyles
})
